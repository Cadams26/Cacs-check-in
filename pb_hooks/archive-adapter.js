const core = require(__hooks + '/archive-core.js');
const ownerId = 'a9rnjyz6g54spr1';
function root() { return $app.dataDir() + '/log_archives'; }
function settings() {
    const config = JSON.parse(read($app.dataDir() + '/archive-settings.json'));
    if (!config.sender || !Array.isArray(config.recipients) || config.recipients.length !== 2 || config.recipients.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error('Archive mail configuration is incomplete.');
    return config;
}
function idCheck(id) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-z0-9]{12}$/.test(id)) throw new BadRequestError('Invalid archive ID.');
    return id;
}
function path(id, ext) { return root() + '/cacs-logs-' + idCheck(id) + '.' + ext; }
function read(pathname) {
    const file = $os.open(pathname);
    try { return readerToString(file, 64 * 1024 * 1024); } finally { file.close(); }
}
function atomic(pathname, content) {
    const temp = pathname + '.pending';
    $os.writeFile(temp, content, 0o600);
    if (read(temp) !== content) throw new Error('Backup file readback failed.');
    $os.rename(temp, pathname);
}
function load(id) { return JSON.parse(read(path(id, 'json'))); }
function listRaw() {
    $os.mkdirAll(root(), 0o700);
    return $os.readDir(root()).filter(entry => /^cacs-logs-.*\.json$/.test(entry.name())).map(entry => JSON.parse(read(root() + '/' + entry.name()))).sort((a,b) => b.created.localeCompare(a.created));
}
function snapshot(record) {
    const raw = JSON.parse(JSON.stringify(record.publicExport()));
    const ordered = {};
    Object.keys(raw).sort().forEach(key => { ordered[key] = raw[key]; });
    return ordered;
}
function current(dao, id) {
    const found = dao.findRecordsByFilter('logs', 'id = {:id}', '', 1, 0, {id});
    return found.length ? found[0] : null;
}
function matches(record, saved) {
    return record && record.getString('status') === 'Checked Out' && JSON.stringify(snapshot(record)) === JSON.stringify(saved);
}
function check(dao, records, allowMissing) {
    records.forEach(saved => {
        const record = current(dao, saved.id);
        if (!record && allowMissing) return;
        if (!matches(record, saved)) throw new Error('A backed-up record changed. Nothing was cleared; keep this archive for review.');
    });
}
const adapter = {
    recipients: () => settings().recipients,
    hash: text => $security.sha256(text),
    now: () => new Date().toISOString(),
    newId: () => new Date().toISOString().replace(/[:.]/g, '-') + '-' + $security.randomStringWithAlphabet(12, 'abcdefghijklmnopqrstuvwxyz0123456789'),
    records: () => $app.dao().findRecordsByFilter('logs', 'status = "Checked Out"', 'created,id', 20001, 0).map(snapshot),
    list: listRaw, load,
    save: batch => atomic(path(batch.id, 'json'), JSON.stringify(batch)),
    writeCsv: (id, content) => atomic(path(id, 'csv'), content),
    readCsv: id => read(path(id, 'csv')),
    validate: (records, allowMissing) => check($app.dao(), records, allowMissing),
    send: (batch, recipient) => {
        if (!$app.settings().smtp.enabled || $app.settings().meta.senderAddress !== settings().sender) throw new Error('Configured sender is required.');
        const file = $os.open(path(batch.id, 'csv'));
        try {
            const attachments = {};
            attachments['cacs-logs-' + batch.id + '.csv'] = file;
            $app.newMailClient().send(new MailerMessage({
                from: {address: $app.settings().meta.senderAddress, name: $app.settings().meta.senderName},
                to: [{address: recipient}], subject: 'CACS check-in log archive — ' + batch.created,
                text: 'Dated backup of ' + batch.records.length + ' completed check-in records. Active check-ins are excluded. Archive ID: ' + batch.id + '. This email is sent before clearing; check the Admin archive status for the final result.',
                attachments
            }));
        } finally { file.close(); }
    },
    clear: records => {
        let count = 0;
        $app.dao().runInTransaction(tx => {
            check(tx, records, true);
            records.forEach(saved => {
                const record = current(tx, saved.id);
                if (record) { tx.deleteRecord(record); count++; }
            });
        });
        return count;
    }
};
module.exports = {
    owner: c => {
        const auth = c.get('authRecord');
        if (!auth || auth.id !== ownerId) throw new ForbiddenError('Owner account required.');
    },
    locked: fn => {
        $os.mkdirAll(root(), 0o700);
        try { $os.mkdir(root() + '/operation.lock', 0o700); }
        catch (_) { throw new BadRequestError('An archive operation is running or needs recovery. No new operation was started.'); }
        try { return fn(); }
        catch (error) { throw new BadRequestError(String(error.message || error)); }
        finally { $os.remove(root() + '/operation.lock'); }
    },
    prepare: () => core.prepare(adapter),
    finish: id => core.finish(adapter, idCheck(id)),
    list: () => listRaw().map(core.summary),
    download: (c, id, format) => {
        if (format !== 'csv' && format !== 'json') throw new BadRequestError('Unknown backup format.');
        core.verify(adapter, load(id));
        c.response().header().set('Cache-Control', 'no-store');
        return c.attachment(path(id, format), 'cacs-logs-' + id + '.' + format);
    }
};
