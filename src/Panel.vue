<script setup lang="ts">
// Blender 面板：探测绿色版 → 缺失则下载 → 启动并嵌入。
// 所有能力经 inject(CTX_KEY) 拿到的 PluginContext 传导，插件不直接依赖 @tauri-apps/*。
import { inject, onBeforeUnmount, onMounted, ref } from "vue";
import { CTX_KEY } from "@beep/sdk";
import { canManageRuntime, hostCtx } from "./ctx";
import { state } from "./state";
import {
    BLENDER_VERSION,
    blenderExeRel,
    blenderOuterRel,
    blenderZipRel,
    blenderZipUrl,
    humanBytes,
    type MirrorId,
} from "./runtime";

const raw = inject(CTX_KEY);
if (!raw) throw new Error("Blender 面板必须在 Host 的插件容器内使用");
const ctx = hostCtx(raw);

const status = ref("正在检查绿色版…");
const starting = ref(false);
const downloading = ref(false);
const installed = ref(false);
const progressDone = ref(0);
const progressTotal = ref(0);
const mirror = ref<MirrorId>("aliyun");
const embedded = ref(false);
const rootRef = ref<HTMLElement | null>(null);

function exePath() {
    return ctx.resolveAsset(blenderExeRel());
}

async function probe() {
    if (!canManageRuntime(ctx)) {
        installed.value = false;
        status.value = "当前 Host 不支持探测/下载绿色版，请用 work-beep 源码 pnpm tauri dev";
        return;
    }
    installed.value = await ctx.exists(exePath());
    if (state.pid !== null) {
        status.value = `Blender 已启动，桥接端口 ${state.port}`;
        return;
    }
    status.value = installed.value
        ? `已安装 Blender ${BLENDER_VERSION}，可以启动`
        : `未找到绿色版 Blender ${BLENDER_VERSION}，请先下载`;
}

async function startBlender() {
    if (starting.value || downloading.value || state.pid !== null) return;
    if (!(await ctx.exists(exePath()))) {
        installed.value = false;
        status.value = `未找到绿色版 Blender ${BLENDER_VERSION}，请先下载`;
        return;
    }
    starting.value = true;
    status.value = "正在启动 Blender…";
    try {
        const info = await ctx.launch(exePath(), [
            "--python",
            ctx.resolveAsset("bridge/blender_bridge.py"),
            "--",
            "--port",
            "{port}",
        ]);
        state.pid = info.pid;
        state.port = info.port;
        status.value = `Blender 已启动，桥接端口 ${info.port}`;
        const rect = rootRef.value ? ctx.rectOf(rootRef.value) : null;
        if (rect && state.pid !== null) {
            await ctx.embed(state.pid, rect);
            embedded.value = true;
        }
    } catch (e) {
        status.value = `启动失败：${e instanceof Error ? e.message : String(e)}`;
        state.pid = null;
        state.port = null;
    } finally {
        starting.value = false;
    }
}

async function installBlender() {
    if (downloading.value || starting.value || state.pid !== null) return;
    downloading.value = true;
    progressDone.value = 0;
    progressTotal.value = 0;
    const zipPath = ctx.resolveAsset(blenderZipRel());
    const outer = ctx.resolveAsset(blenderOuterRel());
    try {
        status.value = `正在从 ${mirror.value} 下载 Blender ${BLENDER_VERSION}…`;
        await ctx.download(blenderZipUrl(mirror.value), zipPath, (done, total) => {
            progressDone.value = done;
            progressTotal.value = total;
            if (total > 0) {
                status.value = `下载中 ${humanBytes(done)} / ${humanBytes(total)}`;
            } else {
                status.value = `下载中 ${humanBytes(done)}`;
            }
        });
        status.value = "正在解压…";
        await ctx.extractZip(zipPath, outer);
        await ctx.removePath(zipPath);
        if (!(await ctx.exists(exePath()))) {
            throw new Error("解压完成但没有找到 blender.exe");
        }
        installed.value = true;
        status.value = `已安装 Blender ${BLENDER_VERSION}，可以启动`;
    } catch (e) {
        status.value = `下载失败：${e instanceof Error ? e.message : String(e)}`;
        installed.value = false;
    } finally {
        downloading.value = false;
    }
}

async function reinstallBlender() {
    if (downloading.value || starting.value || state.pid !== null) return;
    if (!confirm(`将删除当前绿色版并重新下载 Blender ${BLENDER_VERSION}，确定？`)) return;
    status.value = "正在移除旧的绿色版…";
    try {
        // 删整个 runtime：真目录整棵清掉；开发机 junction 只断开，仓库里的绿色版还在
        await ctx.removePath(ctx.resolveAsset("runtime"));
        await ctx.removePath(ctx.resolveAsset(blenderZipRel()));
    } catch (e) {
        status.value = `移除失败：${e instanceof Error ? e.message : String(e)}`;
        return;
    }
    installed.value = false;
    await installBlender();
}

let stopWatch: (() => void) | null = null;
onMounted(() => {
    probe();
    if (rootRef.value) {
        stopWatch = ctx.watchRect(rootRef.value, (rect) => {
            if (embedded.value && state.pid !== null) {
                ctx.syncRect(state.pid, rect).catch((e) => console.error("同步 Blender 窗口失败：", e));
            }
        });
    }
});
onBeforeUnmount(() => stopWatch?.());

const progressPct = () => {
    if (progressTotal.value <= 0) return 0;
    return Math.min(100, Math.round((progressDone.value / progressTotal.value) * 100));
};
</script>

<template>
    <div ref="rootRef" class="blender-panel">
        <template v-if="!embedded">
            <div class="card">
                <p class="status">{{ status }}</p>
                <label class="mirror" v-if="!installed || downloading">
                    镜像
                    <select v-model="mirror" :disabled="downloading">
                        <option value="aliyun">阿里云（国内）</option>
                        <option value="official">官方</option>
                        <option value="freedif">Freedif</option>
                    </select>
                </label>
                <div v-if="downloading" class="bar">
                    <div class="bar-fill" :style="{ width: progressPct() + '%' }" />
                </div>
                <div class="actions">
                    <button
                        v-if="!installed"
                        class="launch-btn"
                        :disabled="downloading"
                        @click="installBlender"
                    >
                        {{ downloading ? "下载中…" : `下载 Blender ${BLENDER_VERSION}` }}
                    </button>
                    <template v-else>
                        <button class="launch-btn" :disabled="starting || downloading" @click="startBlender">
                            {{ starting ? "启动中…" : "启动 Blender" }}
                        </button>
                        <button
                            class="ghost-btn"
                            :disabled="starting || downloading || state.pid !== null"
                            @click="reinstallBlender"
                        >
                            重新下载
                        </button>
                    </template>
                </div>
            </div>
        </template>
    </div>
</template>

<style scoped>
.blender-panel {
    position: relative;
    height: 100%;
}

.card {
    position: absolute;
    inset: 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 420px;
}

.status {
    margin: 0;
    font-size: 0.875rem;
    color: #ddd;
    opacity: 0.85;
    line-height: 1.5;
}

.mirror {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8125rem;
    color: #ccc;
}

.mirror select {
    padding: 4px 8px;
    color: #1a1a1a;
    background: #e8e8e8;
    border: none;
    border-radius: 4px;
}

.bar {
    height: 6px;
    background: #333;
    border-radius: 3px;
    overflow: hidden;
}

.bar-fill {
    height: 100%;
    background: #e8e8e8;
    transition: width 0.2s linear;
}

.actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
}

.launch-btn,
.ghost-btn {
    padding: 12px 28px;
    font-size: 1rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

.launch-btn {
    color: #1a1a1a;
    background: #e8e8e8;
}

.launch-btn:hover {
    background: #ffffff;
}

.ghost-btn {
    color: #ddd;
    background: transparent;
    border: 1px solid #666;
}

.ghost-btn:hover {
    border-color: #aaa;
}

.launch-btn:disabled,
.ghost-btn:disabled {
    opacity: 0.5;
    cursor: default;
}
</style>
