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
        this._idsJsonGzip = idsJsonGzip;
        this._offsJsonGzip = offsJsonGzip;
        this._avsJsonGzip = avsJsonGzip;
        this._attrsJsonGzip = attrsJsonGzip;
        this._valsJsonGzip = valsJsonGzip;
    }

    _decompress(buff) {
        return JSON.parse(zlib.gunzipSync(buff).toString());
    }

    *ids(pageSize = PAGE_SIZE) {
        const ids = this._decompress(this._idsJsonGzip);
        for (let i = 1, len = ids.length; i < len; i += pageSize) {
            yield ids.slice(i, Math.min(i + pageSize, len));
        }
    }

    *attrs(pageSize = PAGE_SIZE) {
        const attrs = this._decompress(this._attrsJsonGzip);
        for (let i = 1, len = attrs.length; i < len; i += pageSize) {
            yield attrs.slice(i, Math.min(i + pageSize, len));
        }
    }

    *vals(pageSize = PAGE_SIZE) {
        const vals = this._decompress(this._valsJsonGzip);
        for (let i = 1, len = vals.length; i < len; i += pageSize) {
            yield vals.slice(i, Math.min(i + pageSize, len));
        }
    }

    *eavs() {
        const offs = this._decompress(this._offsJsonGzip);
        const avs = this._decompress(this._avsJsonGzip);
        for (let i = 1, len = offs.length; i < len; i++) {
            yield avs.slice(offs[i] * 2, i < len - 1 ? offs[i + 1] * 2 : avs.length);
        }
    }
}

module.exports = {
    checkAccess,
    downloadProperties,
    PropertyDbReader
};
