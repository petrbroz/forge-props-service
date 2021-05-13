const zlib = require('zlib');
const debug = require('debug')('forge');
const { ModelDerivativeClient, ManifestHelper } = require('forge-server-utils');
const { SvfReader } = require('forge-convert-utils');
const { AssetType } = require('forge-convert-utils/lib/svf/schema');

const PAGE_SIZE = 1000;

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
    const idsAsset = svf.findAsset({ type: AssetType.PropertyIDs });
    const offsetsAsset = svf.findAsset({ type: AssetType.PropertyOffsets });
    const avsAsset = svf.findAsset({ type: AssetType.PropertyAVs });
    const attrsAsset = svf.findAsset({ type: AssetType.PropertyAttributes });
    const valsAsset = svf.findAsset({ type: AssetType.PropertyValues });
    if (!idsAsset || !offsetsAsset || !avsAsset || !attrsAsset || !valsAsset) {
        throw new Error('Could not parse property database. Some of the database assets are missing.');
    }
    const buffers = await Promise.all([
        svf.getAsset(idsAsset.URI),
        svf.getAsset(offsetsAsset.URI),
        svf.getAsset(avsAsset.URI),
        svf.getAsset(attrsAsset.URI),
        svf.getAsset(valsAsset.URI)
    ]);
    return new PropertyDbReader(buffers[0], buffers[1], buffers[2], buffers[3], buffers[4]);
}

class PropertyDbReader {
    constructor(idsJsonGzip, offsJsonGzip, avsJsonGzip, attrsJsonGzip, valsJsonGzip) {
        const read = buff => JSON.parse(zlib.gunzipSync(buff).toString());
        this._ids = read(idsJsonGzip);
        this._offs = read(offsJsonGzip);
        this._avs = read(avsJsonGzip);
        this._attrs = read(attrsJsonGzip);
        this._vals = read(valsJsonGzip);
    }

    *ids(pageSize = PAGE_SIZE) {
        for (let i = 1, len = this._ids.length; i < len; i += pageSize) {
            yield this._ids.slice(i, Math.min(i + pageSize, len));
        }
    }

    *attrs(pageSize = PAGE_SIZE) {
        for (let i = 1, len = this._attrs.length; i < len; i += pageSize) {
            yield this._attrs.slice(i, Math.min(i + pageSize, len));
        }
    }

    *vals(pageSize = PAGE_SIZE) {
        for (let i = 1, len = this._vals.length; i < len; i += pageSize) {
            yield this._vals.slice(i, Math.min(i + pageSize, len));
        }
    }

    *eavs() {
        for (let i = 1, len = this._offs.length; i < len; i++) {
            yield this._avs.slice(this._offs[i] * 2, i < len - 1 ? this._offs[i + 1] * 2 : this._avs.length);
        }
    }
}

module.exports = {
    checkAccess,
    downloadProperties,
    PropertyDbReader
};
