// Lease-owned async resources. Evicted in-flight loads are disposed on arrival.
export class ResourceCache<T> {
  private entries = new Map<string, { refs: number; used: number; retired: boolean; value?: T; promise: Promise<T> }>();
  private clock = 0;
  constructor(private load: (key: string) => Promise<T>, private destroy: (value: T) => void, private capacity = 2) {}
  acquire(key: string): { ready: Promise<T>; release: () => void } {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { refs: 0, used: ++this.clock, retired: false, promise: Promise.resolve(null as T) };
      const current = entry;
      entry.promise = this.load(key).then(value => {
        if (current.retired) this.destroy(value);
        else current.value = value;
        return value;
      }).catch(error => {
        if (this.entries.get(key) === current) this.entries.delete(key);
        throw error;
      });
      this.entries.set(key, entry);
    }
    entry.refs++;
    entry.used = ++this.clock;
    this.trim();
    let released = false;
    const current = entry;
    return { ready: entry.promise, release: () => {
      if (released) return;
      released = true;
      current.refs--;
      this.trim();
    } };
  }
  private trim() {
    const idle = [...this.entries.entries()].filter(([, entry]) => !entry.refs).sort((a,b) => a[1].used-b[1].used);
    while (this.entries.size > this.capacity && idle.length) {
      const [key, entry] = idle.shift()!;
      this.entries.delete(key);
      entry.retired = true;
      if (entry.value) this.destroy(entry.value);
    }
  }
  dispose() {
    for (const entry of this.entries.values()) {
      entry.retired = true;
      if (entry.value) this.destroy(entry.value);
    }
    this.entries.clear();
  }
  get size() { return this.entries.size; }
}
