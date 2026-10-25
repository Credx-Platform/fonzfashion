const test = require('node:test');
const assert = require('node:assert/strict');
const {normalize, subtotal} = require('../cart.js');
const products = [{slug:'tee',price:59.99}];
test('restored data rejects invalid products, sizes and quantities', () => {
  assert.deepEqual(normalize([null,{slug:'unknown',size:'S',quantity:1},{slug:'tee',size:'XXL',quantity:1},{slug:'tee',size:'S',quantity:-1},{slug:'tee',size:'S',quantity:1.5}],products),[]);
});
test('same size merges and quantity is bounded; sizes stay separate', () => {
  assert.deepEqual(normalize([{slug:'tee',size:'S',quantity:12},{slug:'tee',size:'S',quantity:15},{slug:'tee',size:'M',quantity:2}],products),[{slug:'tee',size:'S',quantity:20},{slug:'tee',size:'M',quantity:2}]);
});
test('subtotal ignores stored prices and uses integer cents', () => {
  assert.equal(subtotal([{slug:'tee',size:'S',quantity:3,price:0.01}],products),17997);
});
