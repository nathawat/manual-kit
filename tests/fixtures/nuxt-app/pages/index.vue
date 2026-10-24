<template>
  <div>
    <h1>{{ $t('home.title') }}</h1>
    <p>Welcome   back</p>
    <input placeholder="Search" :title="dyn" />
    <TheDrawer />
  </div>
</template>
<script setup lang="ts">
const dyn = 'x'
</script>
