import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import {
  ProcessManager,
  type ProcessStatus,
  type SpawnFn,
} from './processManager.js';

// モック用のChildProcess作成ヘルパー
interface MockChildProcess extends EventEmitter {
  pid: number;
  killed: boolean;
  kill: ReturnType<typeof vi.fn>;
  stdout: EventEmitter;
  stderr: EventEmitter;
}

function createMockProcess(): MockChildProcess {
  const proc = new EventEmitter() as MockChildProcess;
  // テスト用に書き込み可能なプロパティとしてセットアップ
  Object.defineProperty(proc, 'pid', {
    value: Math.floor(Math.random() * 10000) + 1000,
    writable: true,
  });
  Object.defineProperty(proc, 'killed', {
    value: false,
    writable: true,
  });
  proc.kill = vi.fn().mockImplementation(() => {
    (proc as { killed: boolean }).killed = true;
    return true;
  });
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  return proc;
}

describe('ProcessManager', () => {
  let manager: ProcessManager;
  let mockServerProcess: MockChildProcess;
  let mockSpawn: SpawnFn;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServerProcess = createMockProcess();

    // spawnはサーバープロセスのみを返す（Electronは管理しない）
    mockSpawn = vi.fn().mockImplementation(() => {
      return mockServerProcess;
    });

    manager = new ProcessManager({
      spawn: mockSpawn,
      startTimeout: 1000, // テスト用に短いタイムアウト
      stopTimeout: 500,
    });
  });

  afterEach(async () => {
    // テスト後のクリーンアップ
    if (manager.getStatus().state !== 'idle') {
      // プロセス終了をシミュレート
      mockServerProcess.emit('exit', 0, null);
      await manager.stop().catch(() => {});
    }
  });

  describe('getStatus', () => {
    it('初期状態はidleである', () => {
      const status = manager.getStatus();
      expect(status.state).toBe('idle');
      expect(status.threadUrl).toBeNull();
      expect(status.uptime).toBe(0);
    });
  });

  describe('start', () => {
    it('オーバーレイサーバーを起動する', async () => {
      const threadUrl = 'https://example.slack.com/archives/C123/p456';
      const env = new Map([
        ['SLACK_BOT_TOKEN', 'xoxb-test'],
        ['SLACK_APP_TOKEN', 'xapp-test'],
      ]);

      // 非同期でサーバーreadyを通知
      setTimeout(() => {
        (mockServerProcess.stdout as EventEmitter).emit(
          'data',
          Buffer.from('Server running on http://localhost:8000')
        );
      }, 10);

      const sessionId = await manager.start(threadUrl, env);

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
      // サーバープロセスのみ起動（Electronはmainプロセス側で管理）
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });

    it('起動後の状態はrunningになる', async () => {
      const threadUrl = 'https://example.slack.com/archives/C123/p456';
      const env = new Map([['SLACK_BOT_TOKEN', 'xoxb-test']]);

      setTimeout(() => {
        (mockServerProcess.stdout as EventEmitter).emit(
          'data',
          Buffer.from('Server running on http://localhost:8000')
        );
      }, 10);

      await manager.start(threadUrl, env);
      const status = manager.getStatus();

      expect(status.state).toBe('running');
      expect(status.threadUrl).toBe(threadUrl);
    });

    it('既に実行中の場合はエラーをスローする', async () => {
      const threadUrl = 'https://example.slack.com/archives/C123/p456';
      const env = new Map([['SLACK_BOT_TOKEN', 'xoxb-test']]);

      setTimeout(() => {
        (mockServerProcess.stdout as EventEmitter).emit(
          'data',
          Buffer.from('Server running on http://localhost:8000')
        );
      }, 10);

      await manager.start(threadUrl, env);

      await expect(manager.start(threadUrl, env)).rejects.toThrow(
        'Process already running'
      );
    });

    it('サーバー起動タイムアウト時はエラーをスローする', async () => {
      const shortTimeoutManager = new ProcessManager({
        spawn: mockSpawn,
        startTimeout: 50, // 非常に短いタイムアウト
      });

      const threadUrl = 'https://example.slack.com/archives/C123/p456';
      const env = new Map([['SLACK_BOT_TOKEN', 'xoxb-test']]);

      // サーバーreadyを通知しない（タイムアウト発生）
      await expect(shortTimeoutManager.start(threadUrl, env)).rejects.toThrow(
        'Server startup timeout'
      );
    });
  });

  describe('stop', () => {
    it('実行中のサーバープロセスを停止する', async () => {
      const threadUrl = 'https://example.slack.com/archives/C123/p456';
      const env = new Map([['SLACK_BOT_TOKEN', 'xoxb-test']]);

      setTimeout(() => {
        (mockServerProcess.stdout as EventEmitter).emit(
          'data',
          Buffer.from('Server running on http://localhost:8000')
        );
      }, 10);

      await manager.start(threadUrl, env);

      // stopを呼び出し、プロセスが終了したことをシミュレート
      const stopPromise = manager.stop();

      // プロセス終了をシミュレート
      setTimeout(() => {
        mockServerProcess.emit('exit', 0, null);
      }, 10);

      await stopPromise;

      expect(mockServerProcess.kill).toHaveBeenCalled();
    });

    it('停止後の状態はidleになる', async () => {
      const threadUrl = 'https://example.slack.com/archives/C123/p456';
      const env = new Map([['SLACK_BOT_TOKEN', 'xoxb-test']]);

      setTimeout(() => {
        (mockServerProcess.stdout as EventEmitter).emit(
          'data',
          Buffer.from('Server running on http://localhost:8000')
        );
      }, 10);

      await manager.start(threadUrl, env);

      const stopPromise = manager.stop();
      setTimeout(() => {
        mockServerProcess.emit('exit', 0, null);
      }, 10);

      await stopPromise;
      const status = manager.getStatus();

      expect(status.state).toBe('idle');
      expect(status.threadUrl).toBeNull();
    });

    it('idle状態でstopを呼んでも何も起きない', async () => {
      await manager.stop(); // エラーをスローしない
      expect(manager.getStatus().state).toBe('idle');
    });
  });

  describe('onStatusChange', () => {
    it('状態変更時にコールバックが呼ばれる', async () => {
      const callback = vi.fn();
      manager.onStatusChange(callback);

      const threadUrl = 'https://example.slack.com/archives/C123/p456';
      const env = new Map([['SLACK_BOT_TOKEN', 'xoxb-test']]);

      setTimeout(() => {
        (mockServerProcess.stdout as EventEmitter).emit(
          'data',
          Buffer.from('Server running on http://localhost:8000')
        );
      }, 10);

      await manager.start(threadUrl, env);

      // starting → running の2回呼ばれるはず
      expect(callback).toHaveBeenCalled();
      expect(
        callback.mock.calls.some(
          (call) => (call[0] as ProcessStatus).state === 'running'
        )
      ).toBe(true);
    });

    it('コールバックを解除できる', async () => {
      const callback = vi.fn();
      const unsubscribe = manager.onStatusChange(callback);

      unsubscribe();

      const threadUrl = 'https://example.slack.com/archives/C123/p456';
      const env = new Map([['SLACK_BOT_TOKEN', 'xoxb-test']]);

      setTimeout(() => {
        (mockServerProcess.stdout as EventEmitter).emit(
          'data',
          Buffer.from('Server running on http://localhost:8000')
        );
      }, 10);

      await manager.start(threadUrl, env);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('プロセスクラッシュ検知', () => {
    it('サーバープロセスがクラッシュすると状態がidleになる', async () => {
      const threadUrl = 'https://example.slack.com/archives/C123/p456';
      const env = new Map([['SLACK_BOT_TOKEN', 'xoxb-test']]);

      setTimeout(() => {
        (mockServerProcess.stdout as EventEmitter).emit(
          'data',
          Buffer.from('Server running on http://localhost:8000')
        );
      }, 10);

      await manager.start(threadUrl, env);
      expect(manager.getStatus().state).toBe('running');

      // サーバークラッシュをシミュレート
      mockServerProcess.emit('exit', 1, null);

      // 少し待ってから状態を確認
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(manager.getStatus().state).toBe('idle');
    });
  });
});
