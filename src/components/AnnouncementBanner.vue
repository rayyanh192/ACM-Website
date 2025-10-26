<template>
  <div v-if="show && (content || link)">
    <div class="banner-container">
      <div class="banner-text">
        {{ content || '' }}
        <a v-if="link && linkTitle" class="banner-link" :href="link" target="_blank">{{ linkTitle }}</a> 
      </div>
    </div>
  </div>
</template>

<script>
import "../assets/scss/banner-media.scss";
export default {
  name: "AnnouncementBanner",

  props: {
    link: {
      type: String,
      default: ''
    },
    linkTitle: {
      type: String,
      default: ''
    },
    show: {
      type: Boolean,
      default: false
    },
    content: {
      type: String,
      default: ''
    },
  },

  data: () => ({}),

  methods: {},
};
</script>

<style scoped>
a,
a:visited,
a:active {
  font-family: "Poppins", sans-serif;
  font-weight: 600 !important;
  color: lightblue !important;
  text-transform: none;
  transition: 0.4s;
}

a:hover {
  color: white !important;
}
div {
  font-size: 1.3rem;
}
</style>
