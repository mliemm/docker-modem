var assert = require('node:assert');
var path = require('node:path');
var os = require('node:os');
var http = require('node:http');
var { describe, it, beforeEach } = require('node:test');
var Modem = require('../lib/modem');

var unixDefaultSocketPaths = ['/var/run/docker.sock', path.join(os.homedir(), '.docker/run/docker.sock')]
var defaultSocketPaths = os.type() === 'Windows_NT' ? ['//./pipe/docker_engine'] : unixDefaultSocketPaths;

describe('Modem', function () {
  beforeEach(function () {
    delete process.env.DOCKER_HOST;
  });

  it('should default to default socket path', function () {
    var modem = new Modem();

    return modem.getSocketPath().then((socketPath) => {
      assert.ok(socketPath);
      assert.ok(defaultSocketPaths.includes(socketPath));
    });
  });

  it('should use specific cert, key and ca', function () {
    var ca = 'caaaaa';
    var cert = 'certtttt';
    var key = 'keyyyyy';
    var modem = new Modem({
      version: 'v1.39',
      host: '127.0.0.1',
      port: 2376,
      ca,
      cert,
      key
    });

    assert.strictEqual(ca, modem.ca);
    assert.strictEqual(cert, modem.cert);
    assert.strictEqual(key, modem.key);
  });

  it('shouldn\'t default to default socket path', function () {
    var modem = new Modem({
      protocol: 'http',
      host: '127.0.0.1',
      port: 2375
    });
    assert.ok(modem.host);
    assert.strictEqual(modem.socketPath, undefined);
  });

  it('should use default value if argument not defined in constructor parameter object', function () {
    var customHeaders = {
      host: 'my-custom-host'
    };
    var modem = new Modem({
      headers: customHeaders
    });
    assert.ok(modem.headers);
    assert.strictEqual(modem.headers, customHeaders);

    return modem.getSocketPath().then((socketPath) => {
      assert.ok(socketPath);
      assert.ok(defaultSocketPaths.includes(socketPath));
    });
  });

  it('should allow DOCKER_HOST=unix:///path/to/docker.sock', function () {
    process.env.DOCKER_HOST = 'unix:///tmp/docker.sock';

    var modem = new Modem();
    assert.ok(modem.socketPath);
    assert.strictEqual(modem.host, undefined);
    assert.strictEqual(modem.socketPath, '/tmp/docker.sock');
  });

  it('should interpret DOCKER_HOST=unix:// as /var/run/docker.sock', function () {
    process.env.DOCKER_HOST = 'unix://';

    var modem = new Modem();
    return modem.getSocketPath().then((socketPath) => {
      assert.ok(socketPath);
      assert.ok(unixDefaultSocketPaths.includes(socketPath));
    });
  });

  it('should use custom socketPath function once', function () {
    var count = 0;
    var modem = new Modem();
    modem.socketPath = function() {
      assert(++count === 1);
      return 'testpath';
    }
    modem.getSocketPath().then((socketPath) => {
      assert.ok(socketPath);
      assert.ok('testpath');
    });
    return modem.getSocketPath().then((socketPath) => {
      assert.ok(socketPath);
      assert.ok('testpath');
    });
  });

  it('should interpret DOCKER_HOST=tcp://N.N.N.N:2376 as https', function () {
    process.env.DOCKER_HOST = 'tcp://192.168.59.103:2376';

    var modem = new Modem();
    assert.ok(modem.host);
    assert.ok(modem.port);
    assert.ok(modem.protocol);
    assert.strictEqual(modem.host, '192.168.59.103');
    assert.strictEqual(modem.port, '2376');
    assert.strictEqual(modem.protocol, 'https');
  });

  it('should interpret DOCKER_HOST=tcp://[::1]:12345', function () {
    process.env.DOCKER_HOST = 'tcp://[::1]:12345';

    var modem = new Modem();
    assert.ok(modem.host);
    assert.ok(modem.port);
    assert.ok(modem.protocol);
    assert.strictEqual(modem.host, '[::1]');
    assert.strictEqual(modem.port, '12345');
    assert.strictEqual(modem.protocol, 'http');
  });

  it('should interpret DOCKER_HOST=tcp://N.N.N.N:5555 as http', function () {
    delete process.env.DOCKER_TLS_VERIFY;
    process.env.DOCKER_HOST = 'tcp://192.168.59.105:5555';

    var modem = new Modem();
    assert.ok(modem.host);
    assert.ok(modem.port);
    assert.ok(modem.protocol);
    assert.strictEqual(modem.host, '192.168.59.105');
    assert.strictEqual(modem.port, '5555');
    assert.strictEqual(modem.protocol, 'http');
  });

  it('should interpret DOCKER_HOST=tcp://N.N.N.N:5555 as http', function () {
    process.env.DOCKER_TLS_VERIFY = '1';
    process.env.DOCKER_HOST = 'tcp://192.168.59.105:5555';

    var modem = new Modem();
    assert.ok(modem.host);
    assert.ok(modem.port);
    assert.ok(modem.protocol);
    assert.strictEqual(modem.host, '192.168.59.105');
    assert.strictEqual(modem.port, '5555');
    assert.strictEqual(modem.protocol, 'https');
  });

  it('should accept DOCKER_HOST=N.N.N.N:5555 as http', function () {
    delete process.env.DOCKER_TLS_VERIFY;
    process.env.DOCKER_HOST = '192.168.59.105:5555';

    var modem = new Modem();
    assert.ok(modem.host);
    assert.ok(modem.port);
    assert.ok(modem.protocol);
    assert.strictEqual(modem.host, '192.168.59.105');
    assert.strictEqual(modem.port, '5555');
    assert.strictEqual(modem.protocol, 'http');
  });

  it('should auto encode querystring option maps as JSON', function () {
    var modem = new Modem();

    var opts = {
      "limit": 12,
      "filters": {
        "label": [
          "staging",
          "env=green",
        ],
      },
      "t": [
        "repo:latest",
        "repo:1.0.0",
      ],
      /* From /create/image */
      changes: [
        'WORKDIR /app',
        'EXPOSE 80',
        'ENTRYPOINT ["node"]',
        'CMD ["app.js"]',
        'USER root',
        'ENV NODE_ENV=production',
        'ENV SOME_PASSWORD=dockerpassword',
      ]
    };
    var control = 'limit=12&filters={"label"%3A["staging"%2C"env%3Dgreen"]}&t=repo%3Alatest&t=repo%3A1.0.0&changes=WORKDIR %2Fapp&changes=EXPOSE 80&changes=ENTRYPOINT ["node"]&changes=CMD ["app.js"]&changes=USER root&changes=ENV NODE_ENV%3Dproduction&changes=ENV SOME_PASSWORD%3Ddockerpassword';
    var qs = modem.buildQuerystring(opts);
    assert.strictEqual(decodeURI(qs), control);

  });

  it('should parse DOCKER_CLIENT_TIMEOUT from environment', function () {
    process.env.DOCKER_HOST = '192.168.59.105:5555';
    process.env.DOCKER_CLIENT_TIMEOUT = 3000;

    var modem = new Modem();
    assert.strictEqual(modem.timeout, 3000);
  });

  it('should use default http agent when no agent is specified', function () {
    var modem = new Modem();
    assert.strictEqual(typeof modem.agent, 'undefined');
  });

  it('should use custom http agent', function () {
    var httpAgent = new http.Agent({
      keepAlive: true
    });
    var modem = new Modem({
      agent: httpAgent
    });
    assert.ok(modem.agent instanceof http.Agent);
    assert.strictEqual(modem.agent, httpAgent);
  });

  it('should set default ssh agent options from DOCKER_HOST', function() {
    process.env.DOCKER_HOST = 'ssh://user@192.168.59.105:5555';
    process.env.SSH_AUTH_SOCK = '/var/lib/sock';

    var modem = new Modem();
    assert.strictEqual(modem.protocol, 'ssh');
    assert.strictEqual(modem.username, 'user');
    assert.ok(modem.sshOptions);
    assert.strictEqual(modem.sshOptions.agent, '/var/lib/sock');
  });

  it('should combine custom ssh agent options', function() {
    process.env.DOCKER_HOST = 'ssh://user@192.168.59.105:5555';
    process.env.SSH_AUTH_SOCK = '/var/lib/sock';

    var modem = new Modem({
      sshOptions: {
        foo: 'bar', // options are arbitrary, whatever ssh2 supports
      },
    });
    assert.ok(modem.sshOptions);
    assert.strictEqual(modem.sshOptions.agent, '/var/lib/sock');
    assert.strictEqual(modem.sshOptions.foo, 'bar');
  });

  // Dials a hijacked stdin request against a server that upgrades it, then
  // reports the request headers and every byte sent before the upgrade.
  function dialHijacked(dialOptions) {
    return new Promise(function (resolve, reject) {
      var server = http.createServer();
      server.on('upgrade', function (req, socket, head) {
        // A body sent with the upgrade request may arrive on the request
        // stream or on the socket, so collect both.
        var received = head;
        var collect = function (chunk) {
          received = Buffer.concat([received, chunk]);
        };
        req.on('data', collect);
        socket.on('data', collect);
        socket.write(
          'HTTP/1.1 101 UPGRADED\r\n' +
          'Content-Type: application/vnd.docker.raw-stream\r\n' +
          'Connection: Upgrade\r\n' +
          'Upgrade: tcp\r\n' +
          '\r\n'
        );
        // Give any body bytes a chance to arrive before reporting.
        setTimeout(function () {
          socket.destroy();
          server.close();
          resolve({ headers: req.headers, body: received.toString() });
        }, 100);
      });
      server.on('error', reject);
      server.listen(0, '127.0.0.1', function () {
        var modem = new Modem({ host: '127.0.0.1', port: server.address().port, protocol: 'http' });
        modem.dial(Object.assign({
          method: 'POST',
          isStream: true,
          hijack: true,
          openStdin: true,
          statusCodes: { 200: true }
        }, dialOptions), function () {});
      });
    });
  }

  it('should not write attach options to the stdin of a hijacked request', async function () {
    var result = await dialHijacked({
      path: '/containers/abc/attach?',
      options: { stream: true, stdout: true, stderr: true, stdin: true, hijack: true }
    });

    assert.strictEqual(result.body, '');
    assert.strictEqual(result.headers['content-length'], undefined);
  });

  it('should still send the exec start body of a hijacked request', async function () {
    var options = { Detach: false, Tty: true, stdin: true, hijack: true };
    var result = await dialHijacked({
      path: '/exec/abc/start',
      allowEmpty: true,
      options: options
    });

    assert.deepStrictEqual(JSON.parse(result.body), options);
    assert.strictEqual(result.headers['content-length'], String(Buffer.byteLength(result.body)));
  });
});
