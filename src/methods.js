const path = require('path');
const fs = require('fs');
const xmlbuilder = require('xmlbuilder');
const mkdirp = require('mkdirp');
const stripAnsi = require('strip-ansi');
const defaultStylesheet = require('./style');

/**
* Fetches config from package.json
*/
const packageJson = require(path.join(process.cwd(), 'package.json'));
const config = {};
try { const cfg = (packageJson || {})['html-jest-reporter']; if (cfg) { Object.assign(config, cfg); } }
catch (e) { /** do nothing */ }
/**
* Logs a message of a given type in the terminal
* @param {String} type
* @param {String} msg
* @return {Object}
*/
const logMessage = (type, msg) => {
    const types = { default: '\x1b[37m', success: '\x1b[32m', error: '\x1b[31m' };
    const logColor = (!types[type]) ? types.default : types[type];
    const logMsg = `html-jest-reporter >> ${msg}`;
    console.log(logColor, logMsg);
    return { logColor, logMsg }; // Return for testing purposes
};
/**
* Returns the output path for the test report
* @return {String}
*/
const getOutputFilepath = () => config.outputPath || process.env.TEST_REPORT_PATH || path.join(process.cwd(), 'test-report.html');
/**
* Creates a file at the given destination
* @param {String} filePath
* @param {Any}    content
*/
const writeFile = (filePath, content) => new Promise((resolve, reject) => {
    mkdirp(path.dirname(filePath), (err) => !err ? resolve(fs.writeFile(filePath, content)) : reject(`Something went wrong when creating the file: ${err}`));
});
/**
* Returns the stylesheet to be imported in the test report.
* If styleOverridePath is not defined, it will return the default stylesheet (style.js).
* @param {String} filePath
* @return {Promise}
*/
const getStylesheet = () => new Promise((resolve, reject) => {
    // If the styleOverridePath has not been set, return the default stylesheet (style.js).
    if (!config.styleOverridePath) { return resolve(defaultStylesheet); }
    fs.readFile(config.styleOverridePath, 'utf8', (err, content) => {
        // If there were no errors, return the content of the given file.
        return !err ? resolve(content) : reject(`Could not find the specified styleOverridePath: '${config.styleOverridePath}'`);
    });
});
/**
* Sets up a basic HTML page to apply the content to
* @return {xmlbuilder}
*/
const createHtml = (stylesheet) => xmlbuilder.create({
    html: {
        head: {
            meta: { '@charset': 'utf-8' },
            title: { '#text': config.pageTitle || 'Test suite' },
            style: { '@type': 'text/css', '#text': stylesheet },
        },
        body: {
            h1: { '#text': config.pageTitle || 'Test suite' },
        },
    },
});

/**
* Returns a HTML containing the test report.
* @param {String} stylesheet
* @param {Object} testData        The test result data
* @return {xmlbuilder}
*/
const renderHTML = (testData, stylesheet) => new Promise((resolve, reject) => {
    // Make sure that test data was provided
    if (!testData) { return reject('Test data missing or malformed'); }
    // Create an xmlbuilder object with HTML and Body tags
    const htmlOutput = createHtml(stylesheet);
    // Timestamp
    htmlOutput.ele('div', { id: 'timestamp' }, `Start: ${(new Date(testData.startTime)).toLocaleString()}`);

    //Test Suite Summary
    htmlOutput.ele('div', { id: 'suiteSummary'}, `
        ${testData.numTotalTestSuites} TestSuites /
        ${testData.numPassedTestSuites} TestSuites Passed /
        ${testData.numFailedTestSuites} TestSuites Failed
    `);
    // Test Summary
    htmlOutput.ele('div', { id: 'summary' }, `
        ${testData.numTotalTests} tests /
        ${testData.numPassedTests} passed /
        ${testData.numFailedTests} failed /
        ${testData.numPendingTests} pending
    `);
    let k = 1;
    const suiteTable = htmlOutput.ele('table', { class: 'suite-table suitetablemain', cellspacing: '0', cellpadding: '0' });
    const testSuiteTr = suiteTable.ele('tr', { class: 'passed' });
    const testTr = suiteTable.ele('tr', { class: 'suiteHeader' });
    testTr.ele('td', { class: 'suiteFirst' }, 'S.No');
    testTr.ele('td', { class: 'suite' }, 'Name');
    testTr.ele('td', { class: 'suite' }, 'TC Count');
    if (config.enableTestReportCategory) {
        testTr.ele('td', { class: 'suite' }, 'Positive TC Count');
        testTr.ele('td', { class: 'suite' }, 'Negative TC Count');
    }
    testTr.ele('td', { class: 'suite' }, 'Passed');
    testTr.ele('td', { class: 'suite' }, 'Failed');
    // Loop through each test suite
    testData.testResults.forEach((suite) => {
        if (!suite.testResults || suite.testResults.length <= 0) { return; }
        // Suite filepath location
        // Suite Test Table
        const testTr = suiteTable.ele('tr', { class: suite.numFailingTests ? 'failed' : 'passed' });
        let totalPositiveTestCase = 0;
        let passedPositiveTestCase = 0;
        let totalNegativeTestCase = 0;
        let passedNegativeTestCase = 0;
        suite.testResults.forEach((testCase) => {
            if (testCase.title.startsWith('P_')) {
                if (testCase.status === 'passed') {
                    passedPositiveTestCase++;
                }
                totalPositiveTestCase++;
            }
            if (testCase.title.startsWith('N_')) {
                if (testCase.status === 'passed') {
                    passedNegativeTestCase++;
                }
                totalNegativeTestCase++;
            }
        })
        const testTr1 = suiteTable.ele('tr', { class: suite.numFailingTests ? 'failedTestRow' : 'passedTestRow' });
        testTr1.ele('td', { class: 'suiteFirst' }, k);
        testTr1.ele('td', { class: 'suite' }, suite.testResults[0].ancestorTitles.join(' > '));
        testTr1.ele('td', { class: 'suite' }, suite.testResults.length);
        if (config.enableTestReportCategory) {
            testTr1.ele('td', { class: 'suite' }, totalPositiveTestCase);
            testTr1.ele('td', { class: 'suite' }, totalNegativeTestCase);
            testTr1.ele('td', { class: 'suite' }, `P = ${passedPositiveTestCase} N = ${passedNegativeTestCase}`);
            testTr1.ele('td', { class: 'suite' }, `P = ${totalPositiveTestCase - passedPositiveTestCase} N = ${totalNegativeTestCase - passedNegativeTestCase}`);
        }else {
            testTr1.ele('td', { class: 'suite' }, passedPositiveTestCase + passedNegativeTestCase);
            testTr1.ele('td', { class: 'suite' }, suite.testResults.length - (passedPositiveTestCase + passedNegativeTestCase));
        }
        // testTr.ele('td', { class: 'suite' }, `${k}. ${suite.testResults[0].ancestorTitles.join(' > ')}
        //     ${passedPositiveTestCase}/${totalPositiveTestCase} Positive Testcases Passed / ${passedNegativeTestCase}/${totalNegativeTestCase} Negative Testcases Passed
        // `);
        k++;
    });
    // Loop through each test suite
    testData.testResults.forEach((suite) => {
        if (!suite.testResults || suite.testResults.length <= 0) { return; }
        // Suite filepath location
        htmlOutput.ele('div', { class: 'suite-info' }, `
            ${suite.testFilePath} (${(suite.perfStats.end - suite.perfStats.start) / 1000}s)
        `);
        // Suite Test Table
        const suiteTable = htmlOutput.ele('table', { class: 'suite-table', cellspacing: '0', cellpadding: '0' });
        // Loop through each test case
        suite.testResults.forEach((test) => {
            const testTr = suiteTable.ele('tr', { class: test.status });
                // Suite Name(s)
                testTr.ele('td', { class: 'suite' }, test.ancestorTitles.join(' > '));
                // Test name
                const testTitleTd = testTr.ele('td', { class: 'test' }, test.title);
                // Test Failure Messages
                if (test.failureMessages && config.includeFailureMsg) {
                    const failureMsgDiv = testTitleTd.ele('div', { class: 'failureMessages' })
                    test.failureMessages.forEach((failureMsg) => {
                        failureMsgDiv.ele('p', { class: 'failureMsg' }, stripAnsi(failureMsg));
                    });
                }
                // Test Result
                testTr.ele('td', { class: 'result' }, (test.status === 'passed') ?
                    `${test.status} in ${test.duration / 1000}s`
                    : test.status
                );
        });
    });
    return resolve(htmlOutput);
});
/**
* Generates and writes HTML report to a given path
* @param {Object} data Jest test information data
* @param {String} destination The destination of the generated report
* @return {Promise}
*/
const createReport = (data, destination) => {
    return getStylesheet()
        .then(renderHTML.bind(null, data))
        .then(writeFile.bind(null, destination))
        .then(() => logMessage('success', `Report generated (${destination})`))
        .catch(error => logMessage('error', error));
};

/**
* Exports
*/
module.exports = {
    createReport,
    createHtml,
    getOutputFilepath,
    getStylesheet,
    logMessage,
    renderHTML,
    writeFile,
};