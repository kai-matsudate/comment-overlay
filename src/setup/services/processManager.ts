import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'child_process';
import { randomUUID } from 'crypto';

/**
 * プロセスの状態
 */
export type ProcessState = 'idle' | 'starting' | 'running' | 'stopping';

/**
 * プロセス状態の詳細情報
 */
export interface ProcessStatus {
  state: ProcessState;
  threadUrl: string | null;
  sessionId: string | null;
  startedAt: number | null;
  uptime: number;
}

/**
 * spawn関数の型定義
 */
export type SpawnFn = (
  command: string,
  args: string[],
  options?: SpawnOptions
) => ChildProcess;

/**
 * ProcessManagerの設定オプション
 */
export interface ProcessManagerOptions {
  /** サーバー起動タイムアウト（ミリ秒） */
  startTimeout?: number;
  /** 停止タイムアウト（ミリ秒） */
  stopTimeout?: number;
  /** spawn関数（テスト用にDI可能） */
  spawn?: SpawnFn;
}

type StatusChangeCallback = (status: ProcessStatus) => void;

const DEFAULT_START_TIMEOUT = 30000;
const DEFAULT_STOP_TIMEOUT = 5000;

/**
 * オーバーレイサーバーとElectronアプリのプロセスを管理するクラス
 */
export class ProcessManager {
  private state: ProcessState = 'idle';
  private threadUrl: string | null = null;
  private sessionId: string | null = null;
  private startedAt: number | null = null;

  private serverProcess: ChildProcess | null = null;
  private electronProcess: ChildProcess | null = null;

  private callbacks: Set<StatusChangeCallback> = new Set();
  private options: {
    startTimeout: number;
    stopTimeout: number;
    spawn: SpawnFn;
  };

  constructor(options: ProcessManagerOptions = {}) {
    this.options = {
      startTimeout: options.startTimeout ?? DEFAULT_START_TIMEOUT,
      stopTimeout: options.stopTimeout ?? DEFAULT_STOP_TIMEOUT,
      spawn: options.spawn ?? ((cmd, args, opts) => nodeSpawn(cmd, args, opts ?? {})),
    };
  }

  /**
   * 現在の状態を取得
   */
  getStatus(): ProcessStatus {
    return {
      state: this.state,
      threadUrl: this.threadUrl,
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      uptime: this.startedAt ? Date.now() - this.startedAt : 0,
    };
  }

  /**
   * 状態変更のコールバックを登録
   * @returns 登録解除用の関数
   */
  onStatusChange(callback: StatusChangeCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * オーバーレイを起動
   * @param threadUrl SlackスレッドのURL
   * @param env 環境変数のMap
   * @returns セッションID
   */
  async start(
    threadUrl: string,
    env: Map<string, string>
  ): Promise<string> {
    if (this.state !== 'idle') {
      throw new Error('Process already running');
    }

    this.setState('starting');
    this.threadUrl = threadUrl;
    this.sessionId = randomUUID();

    try {
      // 環境変数を準備
      const processEnv = {
        ...process.env,
        ...Object.fromEntries(env),
      };

      // サーバープロセスを起動
      this.serverProcess = this.options.spawn(
        'npx',
        ['tsx', 'src/server.ts', threadUrl],
        {
          env: processEnv,
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );

      // サーバーが起動完了するまで待機
      await this.waitForServerReady();

      // Electronプロセスを起動
      this.electronProcess = this.options.spawn(
        'npm',
        ['run', 'electron'],
        {
          env: processEnv,
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );

      // プロセス終了イベントのリスナーを設定
      this.setupProcessListeners();

      this.startedAt = Date.now();
      this.setState('running');

      return this.sessionId;
    } catch (error) {
      // 起動失敗時はクリーンアップ
      await this.cleanup();
      throw error;
    }
  }

  /**
   * オーバーレイを停止
   */
  async stop(): Promise<void> {
    if (this.state === 'idle') {
      return;
    }

    this.setState('stopping');

    // プロセスを終了
    const stopPromises: Promise<void>[] = [];

    if (this.electronProcess && !this.electronProcess.killed) {
      stopPromises.push(this.killProcess(this.electronProcess));
    }

    if (this.serverProcess && !this.serverProcess.killed) {
      stopPromises.push(this.killProcess(this.serverProcess));
    }

    await Promise.all(stopPromises);
    await this.cleanup();
  }

  /**
   * サーバーが起動完了するまで待機
   */
  private waitForServerReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, this.options.startTimeout);

      const onData = (data: Buffer) => {
        const output = data.toString();
        if (output.includes('Server running on')) {
          clearTimeout(timeout);
          this.serverProcess?.stdout?.off('data', onData);
          resolve();
        }
      };

      this.serverProcess?.stdout?.on('data', onData);

      this.serverProcess?.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Server failed to start: ${err.message}`));
      });

      this.serverProcess?.on('exit', (code) => {
        if (code !== 0) {
          clearTimeout(timeout);
          reject(new Error(`Server exited with code ${code}`));
        }
      });
    });
  }

  /**
   * プロセス終了イベントのリスナーを設定
   */
  private setupProcessListeners(): void {
    const handleExit = () => {
      // プロセスが終了したらクリーンアップ
      if (this.state === 'running') {
        this.cleanup();
      }
    };

    this.serverProcess?.on('exit', handleExit);
    this.electronProcess?.on('exit', handleExit);
  }

  /**
   * プロセスを終了（グレースフル → 強制終了）
   */
  private killProcess(proc: ChildProcess): Promise<void> {
    return new Promise((resolve) => {
      if (proc.killed) {
        resolve();
        return;
      }

      const forceKillTimeout = setTimeout(() => {
        if (!proc.killed) {
          proc.kill('SIGKILL');
        }
        resolve();
      }, this.options.stopTimeout);

      proc.once('exit', () => {
        clearTimeout(forceKillTimeout);
        resolve();
      });

      proc.kill('SIGTERM');
    });
  }

  /**
   * 状態をリセット
   */
  private async cleanup(): Promise<void> {
    this.serverProcess = null;
    this.electronProcess = null;
    this.threadUrl = null;
    this.sessionId = null;
    this.startedAt = null;
    this.setState('idle');
  }

  /**
   * 状態を更新し、コールバックを呼び出す
   */
  private setState(newState: ProcessState): void {
    this.state = newState;
    const status = this.getStatus();
    for (const callback of this.callbacks) {
      try {
        callback(status);
      } catch {
        // コールバックエラーは無視
      }
    }
  }
}
