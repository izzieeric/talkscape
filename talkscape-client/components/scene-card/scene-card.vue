<template>
  <view class="scene-tile" :class="variant + '-tile'" @click="$emit('open', scene)">
    <view v-if="showRemove" class="tile-remove-btn" @click.stop="$emit('remove', scene)">
      <text>✕</text>
    </view>
    <view class="tile-head">
      <text class="tile-title">{{ scene.title }}</text>
    </view>
    <text class="tile-summary">{{ summary }}</text>
    <view class="tile-body">
      <text class="tile-emoji">{{ scene.icon || '📚' }}</text>
    </view>
    <view class="tile-foot">
      <text class="tile-meta">{{ metaText }}</text>
      <view v-if="statusText" class="tile-status-badge" :class="statusClass">{{ statusText }}</view>
    </view>
  </view>
</template>

<script>
export default {
  name: 'SceneCard',
  props: {
    scene: { type: Object, required: true },
    variant: { type: String, default: 'mine' },
    showRemove: { type: Boolean, default: false },
    statusText: { type: String, default: '' },
    statusClass: { type: String, default: 'default' },
    summary: { type: String, default: '' },
    metaText: { type: String, default: '' }
  }
};
</script>

<style scoped>
.scene-tile { width: 148px; height: 176px; padding: 12px; border-radius: 14px; border: 1px solid #ececec; background: #fafafa; box-sizing: border-box; display: flex; flex-direction: column; position: relative; overflow: hidden; }
.scene-tile:active { transform: scale(0.98); }
.tile-remove-btn { position: absolute; top: 8px; right: 8px; width: 22px; height: 22px; background: rgba(0,0,0,0.06); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #666; z-index: 10; transition: all 0.15s; }
.tile-remove-btn:active { background: rgba(0,0,0,0.15); }
.mine-tile { background: #f8fafc; }
.featured-tile { background: #f6f8ff; }
.free-tile { background: #f7fcf8; }
.level-tile { background: #fbfbfb; }
.tile-head { display: flex; align-items: flex-start; padding-right: 20px; }
.tile-title { display: -webkit-box; font-size: 16px; font-weight: 700; color: #111827; line-height: 1.3; white-space: normal; overflow: hidden; line-clamp: 2; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.tile-summary { display: -webkit-box; margin-top: 10px; font-size: 12px; line-height: 1.5; color: #667085; white-space: normal; overflow: hidden; line-clamp: 3; -webkit-line-clamp: 3; -webkit-box-orient: vertical; min-height: 54px; }
.tile-body { flex: 1; display: flex; align-items: center; justify-content: flex-end; padding-bottom: 6px; }
.tile-emoji { font-size: 32px; line-height: 1; }
.tile-foot { position: absolute; bottom: 0; left: 0; right: 0; height: 36px; padding: 0 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; background: rgba(255, 255, 255, 0.15); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); border-bottom-left-radius: 14px; border-bottom-right-radius: 14px; box-sizing: border-box; z-index: 5; border-top: 1px solid rgba(255,255,255,0.25); }
.tile-meta { font-size: 11px; color: #475569; font-weight: 600; }
.tile-status-badge { flex-shrink: 0; padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; line-height: 1; }
.tile-status-badge.default { background: rgba(0,0,0,0.04); color: #64748b; }
.tile-status-badge.added { background: #e0f2fe; color: #0369a1; }
.tile-status-badge.completed { background: #dcfce7; color: #166534; }
</style>
