// Host 已实现、SDK 包尚未发版时的补充方法。运行期从 inject 的 ctx 上取。
import type { PluginContext } from "@beep/sdk";

export type HostCtx = PluginContext & {
    exists(path: string): Promise<boolean>;
    download(
        url: string,
        dest: string,
        onProgress?: (done: number, total: number) => void,
    ): Promise<void>;
    extractZip(zipPath: string, destDir: string): Promise<void>;
    removePath(path: string): Promise<void>;
};

export function hostCtx(ctx: PluginContext): HostCtx {
    return ctx as HostCtx;
}

export function canManageRuntime(ctx: HostCtx): boolean {
    return typeof ctx.exists === "function" && typeof ctx.download === "function";
}
