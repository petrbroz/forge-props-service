const debug = require('debug')('forge');
const { ModelDerivativeClient, ManifestHelper } = require('forge-server-utils');
const { SvfReader } = require('forge-convert-utils');

async function checkAccess(urn, token) {
    const client = new ModelDerivativeClient({ token });
    await client.getManifest(urn);
}

async function downloadProperties(urn, token) {
    const modelDerivativeClient = new ModelDerivativeClient({ token });
    debug('Retrieving Model Derivative manifest');
    const helper = new ManifestHelper(await modelDerivativeClient.getManifest(urn));
    const viewables = helper.search({ type: 'resource', role: 'graphics' }).filter(d => d.mime === 'application/autodesk-svf');
    if (viewables.length === 0) {
        throw new Error('No viewables found.');
    }
    const svf = await SvfReader.FromDerivativeService(urn, viewables[0].guid, { token });
    debug('Downloading PropDb files');
    const pdb = await svf.getPropertyDb();
    return pdb;
}

module.exports = {
    checkAccess,
    downloadProperties
};
