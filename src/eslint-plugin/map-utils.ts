// Anything keyed like a Map, so a WeakMap cache can use getOrCreate too.
type KeyedStore<K, V> = {
	get(key: K): V | undefined;
	set(key: K, value: V): void;
};

export const getOrCreate = <K, V>(
	store: KeyedStore<K, V>,
	key: K,
	make: () => V
): V => {
	const existing = store.get(key);

	if (existing !== undefined) {
		return existing;
	}

	const created = make();

	store.set(key, created);

	return created;
};