export function createStateStore() {
  let latest = null;
  let version = 0;

  return {
    update(state) {
      latest = state;
      version += 1;
      return version;
    },
    snapshot() {
      return { version, state: latest };
    },
  };
}
