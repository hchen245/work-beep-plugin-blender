// 绿色版路径与下载地址：改版本号时与 scripts/fetch_blender.py 的 DEFAULT_VERSION 同步。
export const BLENDER_VERSION = "5.2.1";
export const BLENDER_PLATFORM = "windows-x64";

const pack = `blender-${BLENDER_VERSION}-${BLENDER_PLATFORM}`;

/** resolveAsset 相对路径 → blender.exe（zip 自带一层同名目录） */
export function blenderExeRel(): string {
    return `runtime/${pack}/${pack}/blender.exe`;
}

export function blenderOuterRel(): string {
    return `runtime/${pack}`;
}

export function blenderZipRel(): string {
    return `runtime/${pack}.zip`;
}

export const MIRRORS = {
    aliyun: "https://mirrors.aliyun.com/blender/release",
    official: "https://download.blender.org/release",
    freedif: "https://mirror.freedif.org/blender/release",
} as const;

export type MirrorId = keyof typeof MIRRORS;

export function blenderZipUrl(mirror: MirrorId): string {
    const [major, minor] = BLENDER_VERSION.split(".");
    return `${MIRRORS[mirror]}/Blender${major}.${minor}/${pack}.zip`;
}

export function humanBytes(n: number): string {
    if (n <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let v = n;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
        v /= 1024;
        i += 1;
    }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
