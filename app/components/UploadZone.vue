<script setup lang="ts">
const emit = defineEmits<{ "update:file": [f: File | null] }>();
const props = defineProps<{ file: File | null }>();

const dragging = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);

function onDrop(e: DragEvent) {
  dragging.value = false;
  const f = e.dataTransfer?.files?.[0];
  if (f) emit("update:file", f);
}
function onPick(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) emit("update:file", f);
}
</script>

<template>
  <div
    @dragover.prevent="dragging = true"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
    @click="inputRef?.click()"
    :class="[
      'cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all',
      dragging
        ? 'border-indigo-400 bg-indigo-500/10'
        : file
          ? 'border-emerald-500 bg-emerald-500/10'
          : 'border-slate-700 bg-slate-900 hover:border-slate-500',
    ]"
  >
    <input ref="inputRef" type="file" accept=".xlsx,.xls,.csv" class="hidden" @change="onPick" />

    <div v-if="file" class="space-y-1">
      <p class="text-sm font-semibold text-emerald-400">{{ file.name }}</p>
      <p class="text-xs text-slate-500">{{ (file.size / 1024).toFixed(1) }} KB — click to replace</p>
    </div>
    <div v-else class="space-y-2">
      <div class="mx-auto size-10 rounded-full bg-slate-800 flex items-center justify-center">
        <svg class="size-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
      </div>
      <p class="text-sm text-slate-400">Drop your <span class="text-white">.xlsx</span> here or click to browse</p>
      <p class="text-xs text-slate-600">Needs a <code class="text-slate-400">name</code> column. Max 1000 rows / 5 MB.</p>
    </div>
  </div>
</template>
