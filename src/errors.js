export class AuthRequiredError extends Error {
  constructor(msg = '未登录，请先运行: zovii login <username> <password>') {
    super(msg);
    this.name = 'AuthRequiredError';
  }
}

export class ArgumentError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'ArgumentError';
  }
}

export class CommandError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'CommandError';
  }
}

export class TimeoutError extends Error {
  constructor(label, sec) {
    super(`${label} 超时（${sec}s），可加大 --timeout`);
    this.name = 'TimeoutError';
  }
}
