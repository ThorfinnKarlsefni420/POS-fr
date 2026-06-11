
async function check() {
  try {
    const res = await fetch('http://localhost:3001/api/settings');
    const body = await res.json();
    console.log('Settings:', body);
  } catch (e) {
    console.error('Fetch failed:', e);
  }
}
check();
