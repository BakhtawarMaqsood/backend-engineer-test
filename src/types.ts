export interface Output {
  address: string;
  value: number;
}

export interface Input {
  txId: string;
  index: number;
}

export interface Transaction {
  id: string;
  inputs: Array<Input>;
  outputs: Array<Output>;
}

export interface Block {
  id: string;
  height: number;
  transactions: Array<Transaction>;
}

export interface Balance {
  address: string;
  balance: string;
}

export interface IDatabase {
  createTables(): Promise<void>;
  getCurrentHeight(): Promise<number>;
  validateBlockId(block: Block): Promise<boolean>;
  validateInputOutputBalance(transactions: Transaction[]): Promise<boolean>;
  addBlock(block: Block): Promise<void>;
  getBalance(address: string): Promise<bigint>;
  rollbackToHeight(height: number): Promise<void>;
  toSatoshis(value: number | string): bigint;
}
