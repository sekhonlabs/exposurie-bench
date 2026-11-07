'use strict';
// Part 12's network trap, for runner/its-yours.mjs.
//
// Loaded into every Node process a part 12 check starts, through
// NODE_OPTIONS=--require <this file>, before any of the program's own code
// runs, and inherited by every Node process that one starts in turn (npm,
// when uninstall removes the package). Every way Node opens a connection or
// looks up a name goes through one of the functions replaced below. Each
// replacement writes the attempt to the file named by BENCH_NET_LOG and then
// throws, so nothing leaves the machine.
//
// A connection to a local pipe (a path, not a host and port) is let through:
// that is how a process talks to its own children, not to a network.
//
// runner/its-yours.mjs checks that the trap works before it trusts it: a
// control process tries each way out, from CommonJS and from an ES module,
// and every attempt must be in the log.

const fs = require('node:fs');
const { syncBuiltinESMExports } = require('node:module');

const LOG = process.env.BENCH_NET_LOG;
const LABEL = process.env.BENCH_NET_LABEL || '';

function caught(what, target) {
  try {
    if (LOG) {
      const program = require('node:path').basename(process.argv[1] || '');
      const entry = { what, target: String(target ?? ''), label: LABEL, program, pid: process.pid, at: new Date().toISOString() };
      fs.appendFileSync(LOG, `${JSON.stringify(entry)}\n`);
    }
  } catch {
    // The throw below still blocks the call.
  }
  const e = new Error(`blocked by the benchmark's network trap: ${what} ${target ?? ''}`.trim());
  e.code = 'EBENCHNONET';
  throw e;
}

const urlOf = (a) => {
  const x = a[0];
  if (typeof x === 'string' || x instanceof URL) return String(x);
  if (x && typeof x === 'object') return `${x.protocol ?? ''}//${x.hostname ?? x.host ?? ''}:${x.port ?? ''}${x.path ?? ''}`;
  return '';
};
const block = (mod, name, what, targetOf = urlOf) => {
  if (mod && typeof mod[name] === 'function') {
    mod[name] = function trapped(...a) {
      return caught(what, targetOf(a));
    };
  }
};

// Every TCP connection, TLS included, ends in Socket.prototype.connect.
const net = require('node:net');
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function trapped(...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const pipe = (first && typeof first === 'object' && typeof first.path === 'string') ||
    (typeof first === 'string' && !/^\d+$/.test(first));
  if (pipe) return connect.apply(this, args);
  const target = first && typeof first === 'object' ? `${first.host ?? 'localhost'}:${first.port}` : `${args[1] ?? 'localhost'}:${first}`;
  return caught('net.Socket.connect', target);
};

for (const m of ['http', 'https']) {
  const mod = require(`node:${m}`);
  block(mod, 'request', `${m}.request`);
  block(mod, 'get', `${m}.get`);
}
block(require('node:http2'), 'connect', 'http2.connect');
block(require('node:tls'), 'connect', 'tls.connect', (a) => (typeof a[0] === 'object' ? `${a[0].host ?? ''}:${a[0].port ?? ''}` : `${a[1] ?? ''}:${a[0]}`));
block(require('node:dgram'), 'createSocket', 'dgram.createSocket', (a) => (typeof a[0] === 'object' ? a[0].type : a[0]));

const dns = require('node:dns');
const LOOKUPS = [
  'lookup', 'lookupService', 'resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveCaa', 'resolveCname', 'resolveMx',
  'resolveNaptr', 'resolveNs', 'resolvePtr', 'resolveSoa', 'resolveSrv', 'resolveTxt', 'reverse',
];
for (const name of LOOKUPS) {
  block(dns, name, `dns.${name}`, (a) => a[0]);
  block(dns.promises, name, `dns.promises.${name}`, (a) => a[0]);
  block(dns.Resolver && dns.Resolver.prototype, name, `dns.Resolver.${name}`, (a) => a[0]);
  block(dns.promises.Resolver && dns.promises.Resolver.prototype, name, `dns.promises.Resolver.${name}`, (a) => a[0]);
}

if (typeof globalThis.fetch === 'function') {
  globalThis.fetch = function trapped(...a) {
    return caught('fetch', urlOf(a));
  };
}
if (typeof globalThis.WebSocket === 'function') {
  globalThis.WebSocket = class TrappedWebSocket {
    constructor(url) {
      caught('WebSocket', url);
    }
  };
}

// ES modules that import a builtin's named exports see the replacements too.
syncBuiltinESMExports();
