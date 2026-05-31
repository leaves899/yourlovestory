import { spawn, ChildProcess } from 'child_process';

// 通信协议定义
interface BridgeConfig {
  script: string;
  protocol: 'stdio';
  timeout: number;
  maxRetries: number;
  heartbeatInterval: number;
}

// 错误类型分类
type PythonErrorType =
  | 'TRANSIENT'    // 可重试（网络、资源）
  | 'PERMANENT'    // 不可重试（语法、逻辑）
  | 'TIMEOUT'      // 超时
  | 'CRASHED';     // 进程崩溃

interface BridgeError {
  type: PythonErrorType;
  message: string;
  retryable: boolean;
}

// JSON-RPC 风格的请求/响应格式
interface JsonRpcRequest {
  id: string;
  method: string;
  args: any[];
}

interface JsonRpcResponse {
  id: string;
  result?: string;
  error?: { code: number; message: string };
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}

const DEFAULT_CONFIG: BridgeConfig = {
  script: 'scripts/fragment_bridge.py',
  protocol: 'stdio',
  timeout: 30000,
  maxRetries: 3,
  heartbeatInterval: 30000,
};

// 长度前缀协议：发送 <length>:<json>\n
function encodeMessage(json: string): string {
  return `${Buffer.byteLength(json, 'utf-8')}:${json}\n`;
}

class PythonBridge {
  private process: ChildProcess | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private requestId = 0;
  private isReady = false;
  private initPromise: Promise<void> | null = null;
  private config: BridgeConfig;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private buffer = ''; // 接收缓冲区

  constructor(config: Partial<BridgeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // 解析长度前缀协议
  private parseBuffer(): void {
    while (this.buffer.length > 0) {
      // 查找长度前缀的分隔符 ':'
      const colonIndex = this.buffer.indexOf(':');
      if (colonIndex === -1) break;

      // 解析长度
      const lengthStr = this.buffer.substring(0, colonIndex);
      const length = parseInt(lengthStr, 10);
      if (isNaN(length)) {
        // 无效的长度前缀，跳过
        this.buffer = this.buffer.substring(colonIndex + 1);
        continue;
      }

      // 检查是否有足够的数据
      const messageStart = colonIndex + 1;
      const messageEnd = messageStart + length;
      if (this.buffer.length < messageEnd) break;

      // 提取消息
      const message = this.buffer.substring(messageStart, messageEnd);
      this.buffer = this.buffer.substring(messageEnd);

      // 处理消息
      this.handleMessage(message);
    }
  }

  private handleMessage(message: string): void {
    try {
      const response = JSON.parse(message);
      if (response.type === 'ready') {
        this.isReady = true;
        // resolve 会在 initialize 中处理
      } else if (response.id) {
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(response.id);
          if (response.error) {
            pending.reject(new Error(response.error.message));
          } else {
            pending.resolve(response.data);
          }
        }
      }
    } catch (e) {
      console.warn('[PythonBridge] Failed to parse message:', message);
    }
  }

  async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      this.process = spawn(pythonCmd, ['-u', 'scripts/fragment_bridge.py'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
      });

      this.process.stdout?.on('data', (data: Buffer) => {
        this.buffer += data.toString();
        this.parseBuffer();

        // 检查是否已 ready
        if (this.isReady) {
          resolve();
        }
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        console.error('[Python stderr]', data.toString());
      });

      this.process.on('error', reject);
      this.process.on('exit', (code) => {
        console.warn(`[PythonBridge] Process exited with code ${code}`);
        this.isReady = false;
        this.process = null;
        this.initPromise = null;
        this.buffer = '';

        // 拒绝所有挂起的请求
        this.pendingRequests.forEach((pending) => {
          clearTimeout(pending.timer);
          pending.reject(new Error(`Python process exited (code ${code})`));
        });
        this.pendingRequests.clear();

        // 通知所有渲染进程 Python 进程已断开
        const { BrowserWindow } = require('electron');
        BrowserWindow.getAllWindows().forEach((window: any) => {
          if (!window.isDestroyed()) {
            window.webContents.send('bridge:disconnected', { code });
          }
        });
      });

      setTimeout(() => {
        if (!this.isReady) reject(new Error('Python init timeout'));
      }, 5000);
    });

    return this.initPromise;
  }

  async call(method: string, ...args: any[]): Promise<string> {
    if (!this.process || !this.isReady) {
      try {
        await this.initialize();
      } catch (e) {
        throw new Error('Python process unavailable. Please restart the application.');
      }
    }

    if (!this.process) {
      throw new Error('Python process unavailable');
    }

    return new Promise((resolve, reject) => {
      const id = `req_${++this.requestId}`;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${id} timeout (30s)`));
      }, 30000);

      this.pendingRequests.set(id, { resolve, reject, timer });

      // 使用长度前缀协议发送
      const json = JSON.stringify({ id, method, args });
      this.process!.stdin?.write(encodeMessage(json));
    });
  }

  destroy() {
    this.process?.kill();
    this.pendingRequests.forEach(p => {
      clearTimeout(p.timer);
      p.reject(new Error('Bridge destroyed'));
    });
    this.pendingRequests.clear();
  }
}

export const pythonBridge = new PythonBridge();