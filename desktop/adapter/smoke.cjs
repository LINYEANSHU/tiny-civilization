module.exports = async ({ evaluate, wait }) => {
  await wait("document.querySelector('#overlay.done') && document.querySelector('#scene')");
  await evaluate("document.querySelector('#btnPause').click(); document.querySelector('#btnHistory').click()");
  await wait("document.querySelector('#historyPanel:not(.hidden)')");
};
