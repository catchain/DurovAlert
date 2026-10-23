const fs = require('fs');
const path = require('path');

class PersistentStorage {
  constructor(filename) {
    this.filePath = path.join(__dirname, filename);
    this.data = this.load();
    this.data.seededWallets = this.data.seededWallets || {};
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading persistent storage:', error);
    }
    return { lastProcessedTime: 0, processedTxs: {} };
  }

  save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data), 'utf8');
    } catch (error) {
      console.error('Error saving persistent storage:', error);
    }
  }

  getLastProcessedTime() {
    return this.data.lastProcessedTime;
  }

  setLastProcessedTime(timestamp) {
    this.data.lastProcessedTime = timestamp;
    this.save();
  }

  hasProcessedTx(txId) {
    return !!this.data.processedTxs[txId];
  }

  markTxProcessed(txId) {
    this.data.processedTxs[txId] = true;
    this.save();
  }

  markTxsProcessed(txIds) {
    for (const id of txIds) this.data.processedTxs[id] = true;
    this.save();
  }

  isWalletSeeded(wallet) {
    return !!this.data.seededWallets[wallet.toUpperCase()];
  }

  markWalletSeeded(wallet) {
    this.data.seededWallets[wallet.toUpperCase()] = true;
    this.save();
  }
}

module.exports = PersistentStorage; 