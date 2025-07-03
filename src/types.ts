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
  balance: number;
}
