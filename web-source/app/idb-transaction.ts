/** A request success is NOT a committed write. Resolve only on transaction completion. */
export function runStoreTransaction<T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  enqueue: (store: IDBObjectStore, result: (value: T) => void) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    let value: T;
    tx.oncomplete = () => resolve(value);
    tx.onabort = () => reject(tx.error ?? new Error("The recording transaction was aborted."));
    // Do not preventDefault: a failed request must abort the whole transaction.
    tx.onerror = () => { /* onabort is the terminal failure notification. */ };
    try {
      enqueue(tx.objectStore(storeName), (next) => { value = next; });
    } catch (error) {
      try { tx.abort(); } catch { /* Transaction may already have ended. */ }
      reject(error);
    }
  });
}
