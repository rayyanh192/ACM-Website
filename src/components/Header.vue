<template>
  <header class="app-header">
    <div class="header-content">
      <h1 class="header-title">{{ title }}</h1>
      <nav class="header-nav" v-if="showNavigation">
        <slot name="navigation">
          <!-- Default navigation content -->
        </slot>
      </nav>
    </div>
  </header>
</template>

<script>
export default {
  name: 'Header',
  props: {
    title: {
      type: String,
      default: 'ACM Website'
    },
    showNavigation: {
      type: Boolean,
      default: true
    }
  },
  data() {
    return {
      // Component data properties
    };
  }
};
</script>

<style scoped>
.app-header {
  background-color: #f8f9fa;
  border-bottom: 1px solid #dee2e6;
  padding: 1rem 0;
}

.header-content {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 1rem;
}

.header-title {
  margin: 0;
  color: #333;
  font-size: 1.5rem;
}

.header-nav {
  display: flex;
  align-items: center;
}
</style>