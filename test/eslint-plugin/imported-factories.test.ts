import { join } from 'node:path';
import t from 'tap';
import { rules } from '../../src/eslint-plugin.ts';
import { fixtureDir, writeFixture } from './fixtures.ts';
import {
	conflict,
	dup,
	IMPORT_CREATE_SV,
	jsxTester,
	repeat,
	restyle,
	shared,
	tester,
	tsTester
} from './helpers.ts';

// A page beside the factory modules, so relative imports reach them.
const PAGE = join(fixtureDir, 'page.js');

const DUP_CONFIG = "({ base: 'p-2 p-2', variants: {} });";

const SHARED_VARIANTS =
	"({ variants: { size: { sm: 'p-2 a', md: 'p-2 b' } }, requiredVariants: ['size'] });";

const LIFTED_VARIANTS =
	"({ base: 'p-2', variants: { size: { sm: 'a', md: 'b' } }, requiredVariants: ['size'] });";

writeFixture(
	'factory/sv.ts',
	`${IMPORT_CREATE_SV}const shared = { cacheSize: 10 };

	export const customSV = createSV({ base: 'm-1', postProcess: (c) => c });
	export const bareSV = createSV();
	export const strictSV = createSV({ requiredVariants: true });
	export const spreadSV = createSV({ ...shared });
	export const aliased = customSV;
	export const notFactory = makeThing({});
	export default createSV({ cacheSize: 5 });
	`
);

// A barrel renaming one factory and star-exporting the rest.
writeFixture(
	'factory/barrel.ts',
	"export { customSV as relayed } from './sv.ts';\nexport * from './sv.ts';\n"
);

// A component styled through an imported factory, so following the component
// means following the factory from inside the imported module too.
writeFixture(
	'factory/button.jsx',
	`import { bareSV } from './sv.ts';
	const button = bareSV({ base: 'p-2', variants: {} });

	export function Button({ className }) {
		return <i className={button({ class: className })} />;
	}

	export default Button;
	`
);

// Two modules calling what each other exports.
writeFixture(
	'factory/cycle-a.ts',
	"import { b } from './cycle-b.ts';\nexport const a = b({ variants: {} });\n"
);

writeFixture(
	'factory/cycle-b.ts',
	"import { a } from './cycle-a.ts';\nexport const b = a({ variants: {} });\n"
);

// A default-exported factory behind a type assertion.
writeFixture(
	'factory/typed.ts',
	`${IMPORT_CREATE_SV}export default createSV({ base: 'm-1' }) as SV;\n`
);

// A file and a directory of the same name: a specifier that can only name a
// directory reaches its index, which exports no factory.
writeFixture(
	'paths/lib.ts',
	`${IMPORT_CREATE_SV}export const customSV = createSV();\n`
);
writeFixture('paths/lib/index.ts', 'export const customSV = 1;\n');
writeFixture(
	'paths/real/index.ts',
	`${IMPORT_CREATE_SV}export const customSV = createSV();\n`
);

// The alias map as a config may spell it, including values the plugin skips.
type AliasSetting = Record<string, string | number> | null;

const aliasSettings = (alias: AliasSetting) => ({
	'slot-variants': { alias }
});

t.test('no-conflicting-classes through imported factories', (t) => {
	t.doesNotThrow(() => {
		tester.run('no-conflicting-classes', rules['no-conflicting-classes'], {
			valid: [
				// Exports that aren't factories, and a module that isn't there.
				`import { notFactory } from './factory/sv.ts';\nnotFactory${DUP_CONFIG}`,
				`import { customSV } from './factory/missing.ts';\ncustomSV${DUP_CONFIG}`,
				// Modules calling each other's exports are read once each.
				`import { a } from './factory/cycle-a.ts';\na${DUP_CONFIG}`,
				// A config setting its own `base` takes none from the factory,
				// and a factory without one gives none.
				"import { customSV } from './factory/sv.ts';\ncustomSV({ base: 'm-4', variants: {} });",
				"import { bareSV } from './factory/sv.ts';\nbareSV({ variants: { a: { x: 'm-4' } } });",
				// A class list alone isn't followed to the module.
				"import { customSV } from './factory/sv.ts';\ncustomSV('p-2 p-2');",
				// Callees that name no import, or a namespace as a whole.
				`import * as factory from './factory/sv.ts';\nfactory${DUP_CONFIG}\nfactory.customSV${DUP_CONFIG}`,
				`function local() {}\nlocal${DUP_CONFIG}\nconst made = make();\nmade${DUP_CONFIG}`,
				`import { x } from './factory/sv.ts';\nundeclared${DUP_CONFIG}`,
				`/* global declared */\nimport { x } from './factory/sv.ts';\ndeclared${DUP_CONFIG}`,
				// Aliases the shared settings don't map.
				...[
					{ 'slot-variants': null },
					{ 'slot-variants': {} },
					aliasSettings(null),
					aliasSettings({ '@f/': 5 })
				].map((settings) => ({
					code: `import { customSV } from '@f/sv.ts';\ncustomSV${DUP_CONFIG}`,
					settings
				}))
			].map((test) => {
				if (typeof test === 'string') {
					return { code: test, filename: PAGE };
				}

				return { ...test, filename: PAGE };
			}),
			invalid: [
				...[
					// Named, renamed through a barrel, star-exported, default,
					// re-bound in the module, and aliased in this file.
					`import { customSV } from './factory/sv.ts';\ncustomSV${DUP_CONFIG}`,
					`import { relayed } from './factory/barrel.ts';\nrelayed${DUP_CONFIG}`,
					`import { bareSV } from './factory/barrel.ts';\nbareSV${DUP_CONFIG}`,
					`import makeSV from './factory/sv.ts';\nmakeSV${DUP_CONFIG}`,
					`import { aliased } from './factory/sv.ts';\naliased${DUP_CONFIG}`,
					`import { customSV } from './factory/sv.ts';\nconst local = customSV;\nlocal${DUP_CONFIG}`
				].map((code) => ({
					code,
					filename: PAGE,
					errors: repeat(dup('p-2'), 2)
				})),
				{
					// The factory's `base` counts for a config setting none.
					code: "import { customSV } from './factory/sv.ts';\ncustomSV({ variants: { a: { x: 'm-4' } } });",
					filename: PAGE,
					errors: [conflict('m-1, m-4')]
				},
				{
					// A path alias from the plugin's shared settings.
					code: `import { customSV } from '@f/sv.ts';\ncustomSV${DUP_CONFIG}`,
					filename: PAGE,
					settings: aliasSettings({
						'@f/': join(fixtureDir, 'factory'),
						'@x/': 5
					}),
					errors: repeat(dup('p-2'), 2)
				}
			]
		});
	}, 'rule tester passes');
	t.end();
});

t.test('module specifiers resolve as Node reads them', (t) => {
	const paths = join(fixtureDir, 'paths');
	const at = (file: string, specifier: string) => ({
		code: `import { customSV } from '${specifier}';\ncustomSV${DUP_CONFIG}`,
		filename: join(paths, file)
	});

	t.doesNotThrow(() => {
		tester.run('no-conflicting-classes', rules['no-conflicting-classes'], {
			valid: [
				// A directory specifier names the index, not a sibling file.
				at('lib/page.js', '.'),
				at('lib/sub/page.js', '..'),
				at('page.js', './lib/'),
				at('lib/page.js', './sub/..'),
				at('lib/page.js', join(paths, 'lib') + '/.'),
				// An alias matches whole path segments only.
				{
					...at('page.js', 'uireal/index.ts'),
					settings: aliasSettings({ ui: paths })
				}
			],
			invalid: [
				at('page.js', './real/'),
				at('page.js', './lib'),
				{
					...at('page.js', 'ui/real/'),
					settings: aliasSettings({ ui: paths })
				},
				{
					...at('page.js', '#sv'),
					settings: aliasSettings({ '#sv': join(paths, 'lib.ts') })
				}
			].map((test) => ({ ...test, errors: repeat(dup('p-2'), 2) }))
		});
	}, 'rule tester passes');
	t.end();
});

t.test('a default-exported factory behind a type assertion', (t) => {
	t.doesNotThrow(() => {
		tsTester.run(
			'no-conflicting-classes',
			rules['no-conflicting-classes'],
			{
				valid: [],
				invalid: [
					{
						code: `import typedSV from './factory/typed.ts';\ntypedSV${DUP_CONFIG}`,
						filename: join(fixtureDir, 'page.ts'),
						errors: repeat(dup('p-2'), 2)
					},
					{
						// An imported factory called through a type-only
						// wrapper.
						code: `import { customSV } from './factory/sv.ts';\n(customSV as any)${DUP_CONFIG}\ncustomSV!${DUP_CONFIG}\n(customSV satisfies unknown)${DUP_CONFIG}`,
						filename: join(fixtureDir, 'page.ts'),
						errors: repeat(dup('p-2'), 6)
					}
				]
			}
		);
	}, 'rule tester passes');
	t.end();
});

t.test('no-shared-tokens reads an imported factory’s defaults', (t) => {
	const page = (name: string, args: string) =>
		`import { ${name} } from './factory/sv.ts';\n${name}${args}`;

	t.doesNotThrow(() => {
		tester.run('no-shared-tokens', rules['no-shared-tokens'], {
			valid: [],
			invalid: [
				{
					// No `base` default: the lift creates one.
					code: page('bareSV', SHARED_VARIANTS),
					filename: PAGE,
					output: page('bareSV', LIFTED_VARIANTS),
					errors: repeat(shared('p-2', 'size'), 2)
				},
				{
					// A `base` default, or defaults that can't be read, would be
					// replaced by a created one.
					code: page('customSV', SHARED_VARIANTS),
					filename: PAGE,
					output: null,
					errors: repeat(shared('p-2', 'size'), 2)
				},
				{
					code: page('spreadSV', SHARED_VARIANTS),
					filename: PAGE,
					output: null,
					errors: repeat(shared('p-2', 'size'), 2)
				},
				{
					// `requiredVariants: true` makes every variant required.
					code: page(
						'strictSV',
						"({ variants: { size: { sm: 'p-2 a', md: 'p-2 b' } } });"
					),
					filename: PAGE,
					output: page(
						'strictSV',
						"({ base: 'p-2', variants: { size: { sm: 'a', md: 'b' } } });"
					),
					errors: repeat(shared('p-2', 'size'), 2)
				}
			]
		});
	}, 'rule tester passes');
	t.end();
});

t.test('a component called as a factory is no factory', (t) => {
	t.doesNotThrow(() => {
		jsxTester.run(
			'no-conflicting-classes',
			rules['no-conflicting-classes'],
			{
				valid: [
					{
						code: `import Button from './factory/button.jsx';\nButton${DUP_CONFIG}`,
						filename: join(fixtureDir, 'page.jsx')
					}
				],
				invalid: []
			}
		);
	}, 'rule tester passes');
	t.end();
});

t.test('no-restyle follows a component styled by an imported factory', (t) => {
	t.doesNotThrow(() => {
		jsxTester.run('no-restyle', rules['no-restyle'], {
			valid: [
				{
					// A factory rendered as a component forwards nothing.
					code: `import MakeSV from './factory/sv.ts';\n<MakeSV className="p-4" />;`,
					filename: join(fixtureDir, 'page.jsx')
				}
			],
			invalid: [
				{
					code: `import { Button } from './factory/button.jsx';\n<Button className="p-4" />;`,
					filename: join(fixtureDir, 'page.jsx'),
					errors: [restyle('p-4', 'p-2')]
				},
				{
					// The factory's `base` is applied with the config's own.
					code: "import { customSV } from './factory/sv.ts';\nconst b = customSV({ variants: {} });\nb({ class: 'm-4' });",
					filename: join(fixtureDir, 'page.jsx'),
					errors: [restyle('m-4', 'm-1')]
				},
				{
					// The rule's own `alias` option follows an imported factory
					// too, over the shared setting.
					code: `import { customSV } from '@f/sv.ts';\nconst b = customSV({ base: 'p-2', variants: {} });\nb({ class: 'p-4' });`,
					filename: join(fixtureDir, 'page.jsx'),
					options: [
						{ alias: { '@f/': join(fixtureDir, 'factory') } }
					],
					settings: aliasSettings({
						'@f/': join(fixtureDir, 'missing')
					}),
					errors: [restyle('p-4', 'p-2')]
				}
			]
		});
	}, 'rule tester passes');
	t.end();
});