import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Sample test', () => {
    const firstValue = 1;
    const secondValue = 2;
    const thirdValue = 3;
    const testArray = [firstValue, secondValue, thirdValue];
    const notFoundValue = 5;
    const anotherNotFoundValue = 0;
    const expectedNotFoundIndex = -1;

    assert.strictEqual(expectedNotFoundIndex, testArray.indexOf(notFoundValue));
    assert.strictEqual(expectedNotFoundIndex, testArray.indexOf(anotherNotFoundValue));
  });
});
