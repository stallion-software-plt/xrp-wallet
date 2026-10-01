// Stand-in for Node's `assert` in the browser build. Vite would otherwise replace it with an empty
// object, and ripple-lib-transactionparser's assert(condition) call would throw, losing the order
// book changes in Activity.
module.exports = function assert(value, message) {
  if (!value) throw new Error(message || 'Assertion failed');
};
