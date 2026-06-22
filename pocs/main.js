const bcrypt = require('bcryptjs');

async function main(passwordLengthLimit){
    // Password 1: 72 bytes of 'a' followed by '1'
    const password1 = 'a'.repeat(passwordLengthLimit) + '1';
    // Password 2: 72 bytes of 'a' followed by '2'
    const password2 = 'a'.repeat(passwordLengthLimit) + '2';
    // Hash password1
    const hash = await bcrypt.hash(password1, 10);
    // Try to verify both passwords against the same hash
    const password2Matches = await bcrypt.compare(password2, hash);
    if (password2Matches) {
        console.log(`⚠️  MEME VERIFIED: bcrypt only uses first ${passwordLengthLimit} bytes!`);
    } else {
        console.log(`❌ MEME DEBUNKED: bcrypt uses the full password for length ${passwordLengthLimit}.`);
    }
}

for (let i = 1; i <= 73; i++) {
    main(i).catch(console.error);
}