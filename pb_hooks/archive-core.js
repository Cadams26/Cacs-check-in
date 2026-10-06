// Synchronous workflow shared by PocketBase's JS runtime and the Node tests.
function csvCell(value) {
    let text = String(value == null ? '' : value);
    // Prevent a name or destination from becoming a spreadsheet formula.
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
}
function csv(records) {
    const fields = ['id', 'name', 'status', 'zone', 'created', 'updated'];
    return '\uFEFF' + fields.join(',') + '\r\n' + records.map(row => fields.map(key => csvCell(row[key])).join(',')).join('\r\n') + '\r\n';
}
function summary(batch) {
    return {id: batch.id, created: batch.created, count: batch.records.length,
        recipients: batch.recipients, state: batch.state, cleared: batch.cleared || 0,
        filename: 'cacs-logs-' + batch.id + '.csv'};
}
function verify(adapter, batch) {
    if (adapter.hash(JSON.stringify(batch.records)) !== batch.snapshotHash || adapter.hash(adapter.readCsv(batch.id)) !== batch.csvHash) {
        throw new Error('Backup verification failed. No records were cleared.');
    }
}
function prepare(adapter) {
    const pending = adapter.list().filter(b => b.state !== 'cleared');
    if (pending.length) { verify(adapter, pending[0]); return summary(pending[0]); }
    const records = adapter.records();
    if (!records.length) throw new Error('There are no completed logs to archive.');
    if (records.length > 20000) throw new Error('Archive exceeds the 20,000-record safety limit.');
    if (records.some(r => r.status !== 'Checked Out')) throw new Error('Only completed check-outs may be archived.');
    const body = csv(records);
    const batch = {id: adapter.newId(), created: adapter.now(), records,
        recipients: adapter.recipients().slice(), sent: [], state: 'prepared',
        snapshotHash: adapter.hash(JSON.stringify(records)), csvHash: adapter.hash(body)};
    adapter.writeCsv(batch.id, body);
    adapter.save(batch);
    verify(adapter, adapter.load(batch.id));
    return summary(batch);
}
function finish(adapter, id) {
    const batch = adapter.load(id);
    verify(adapter, batch);
    if (batch.state === 'cleared') return summary(batch);
    if (JSON.stringify(batch.recipients) !== JSON.stringify(adapter.recipients())) throw new Error('Archive recipient configuration changed.');
    // Preflight protects against emailing a stale snapshot, before either send.
    adapter.validate(batch.records, batch.state === 'clearing');
    for (const recipient of batch.recipients) {
        if (batch.sent.indexOf(recipient) < 0) {
            adapter.send(batch, recipient);
            batch.sent.push(recipient);
            adapter.save(batch);
        }
    }
    batch.state = 'clearing';
    adapter.save(batch);
    // Adapter rechecks records inside one DB transaction; failure rolls it all back.
    batch.cleared = adapter.clear(batch.records);
    batch.state = 'cleared';
    adapter.save(batch);
    return summary(batch);
}
module.exports = {csvCell, csv, summary, verify, prepare, finish};
