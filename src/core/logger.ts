/**
 * OutputChannel ラッパー。
 * タイムスタンプ付きで統一的にログを書き出すための薄い層。
 */

import * as vscode from "vscode";

export class Logger {
  private readonly channel: vscode.OutputChannel;

  constructor(name: string) {
    this.channel = vscode.window.createOutputChannel(name);
  }

  info(message: string): void {
    this.write(message);
  }

  warn(message: string): void {
    this.write(`WARN: ${message}`);
  }

  error(message: string, error?: unknown): void {
    const detail = error instanceof Error ? `: ${error.message}` : error ? `: ${String(error)}` : "";
    this.write(`ERROR: ${message}${detail}`);
  }

  show(): void {
    this.channel.show();
  }

  dispose(): void {
    this.channel.dispose();
  }

  private write(message: string): void {
    const timestamp = new Date().toISOString();
    this.channel.appendLine(`[${timestamp}] ${message}`);
  }
}
