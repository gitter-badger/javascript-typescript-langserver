import { symbolDescriptorMatch } from '../util';

describe('util tests', function () {
	this.timeout(5000);
	describe('symbolDescriptorMatch', function () {
		it('', function (done: (err?: Error) => void) {
			const want = true;
			const got = symbolDescriptorMatch({
				containerKind: undefined,
				containerName: 'ts',
				kind: 'interface',
				name: 'Program',
				package: undefined
			}, {
					containerKind: 'module',
					containerName: 'ts',
					kind: 'interface',
					name: 'Program',
					package: undefined
				});
			if (want !== got) {
				done(new Error("wanted " + want + ", but got " + got));
				return;
			}
			done();
		});
		it('', function (done: (err?: Error) => void) {
			const want = true;
			const got = symbolDescriptorMatch({
				name: 'a',
				kind: 'class',
				package: { name: 'mypkg' },
				containerKind: undefined,
			}, {
					kind: 'class',
					name: 'a',
					containerKind: '',
					containerName: '',
					package: { name: 'mypkg' },
				});
			if (want !== got) {
				done(new Error("wanted " + want + ", but got " + got));
				return;
			}
			done();
		});
	});
});
