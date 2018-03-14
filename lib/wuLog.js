"use strict"

module.exports = class WuLog {
    constructor (_this){
        this._this = _this;
    }

    log(text) {
        this._this.log(text);
    }
    
}