const { defineConfig } = require('@vue/cli-service')
module.exports = defineConfig({
  transpileDependencies: true,
}).use(require('@vuepress/plugin-google-analytics'), {
  id: 'UA-123456789-0', // Replace with your Google Analytics tracking ID
  router: true,
})
