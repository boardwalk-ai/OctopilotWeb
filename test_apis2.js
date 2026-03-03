async function testStealth() {
  const res = await fetch('https://www.stealthgpt.ai/api/stealthify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-token': '4eb8b6e952b182138bdfd32352bf0ae9166b0147e8bbae3cf936fc39ca99d186' },
    body: JSON.stringify({ prompt: 'Hello world', rephrase: false })
  });
  console.log("Stealth:", res.status, await res.text());
}

async function testUndetectable() {
  const res = await fetch('https://api.undetectable.ai/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': '9019253d-a30c-49a3-aeae-9a5f18e209fd' },
    body: JSON.stringify({ content: 'Hello world', readability: 'High School', purpose: 'Essay', strength: 'Quality' })
  });
  console.log("Undetectable:", res.status, await res.text());
}

async function main() {
  await testStealth();
  await testUndetectable();
}
main();
