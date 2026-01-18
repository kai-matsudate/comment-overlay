import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'fs';
import { checkFrontendBuild } from './setupServer.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

describe('checkFrontendBuild', () => {
  const mockExistsSyncFn = existsSync as ReturnType<typeof vi.fn>;
  let mockConsoleError: ReturnType<typeof vi.spyOn>;
  let mockProcessExit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockProcessExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    mockConsoleError.mockRestore();
    mockProcessExit.mockRestore();
  });

  it('フロントエンドバンドルが存在する場合は正常終了する', () => {
    mockExistsSyncFn.mockReturnValue(true);

    checkFrontendBuild();

    expect(mockProcessExit).not.toHaveBeenCalled();
    expect(mockConsoleError).not.toHaveBeenCalled();
  });

  it('フロントエンドバンドルが存在しない場合はエラーメッセージを表示して終了する', () => {
    mockExistsSyncFn.mockReturnValue(false);

    checkFrontendBuild();

    expect(mockConsoleError).toHaveBeenCalledWith('');
    expect(mockConsoleError).toHaveBeenCalledWith('Error: フロントエンドがビルドされていません');
    expect(mockConsoleError).toHaveBeenCalledWith('先に npm run build を実行してください');
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });
});
