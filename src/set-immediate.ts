type Immediate = (callback: (...args: never[]) => void, ...args: never[]) => ReturnType<typeof setTimeout>;
const schedule: Immediate = (callback, ...args) => globalThis.setTimeout(() => callback(...args), 0);
const host = globalThis as unknown as Omit<typeof globalThis, "setImmediate"> & {setImmediate?: Immediate};
host.setImmediate ??= schedule;
