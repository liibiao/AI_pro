(async () => {
  const page = global.page;
  await page.evaluate(() => {
    const protocol = document.querySelector('#n2 [data-field="protocol"]');
    if (!protocol) throw new Error('protocol select not found');
    protocol.value = 'vip';
    protocol.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.setInputFiles('#n2 [data-file="images"]', '.playwright-cli/fast-vip-ref.jpg');
  await page.$eval('#n2 [data-file="images"]', el => el.dispatchEvent(new Event('change', { bubbles: true })));
})();
