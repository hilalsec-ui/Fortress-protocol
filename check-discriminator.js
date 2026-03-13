// Verify the discriminator using the same method as Anchor SDK
const crypto = require('crypto');

function anchorDiscriminator(namespace, name) {
  const preimage = `${namespace}:${name}`;
  const hash = crypto.createHash('sha256').update(preimage).digest();
  return Array.from(hash.slice(0, 8));
}

// What we used
console.log('global:randomness_commit =', anchorDiscriminator('global', 'randomness_commit'));
// Try variations
console.log('global:randomnessCommit =', anchorDiscriminator('global', 'randomnessCommit'));
console.log('instruction:randomness_commit =', anchorDiscriminator('instruction', 'randomness_commit'));
console.log('instruction:randomnessCommit =', anchorDiscriminator('instruction', 'randomnessCommit'));

// Also: the SDK method call is program.instruction.randomnessCommit({}, {...})
// which means the IDL instruction name is 'randomnessCommit' (camelCase)
// But Anchor 0.3x uses snake_case for discriminators regardless
