const localforage = {
	createInstance(): never {
		throw new Error("EPUB local storage is not available in Awesome Reader");
	},
};

export default localforage;
