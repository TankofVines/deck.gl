/* eslint-disable */
/*
  Modified from Uday Verma and Howard Butler's plasio
  https://github.com/verma/plasio/
  MIT License
*/

// laz-perf.js
var Module;
if (!Module) Module = (typeof Module !== 'undefined' ? Module : null) || {};
var moduleOverrides = {};
for (var key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}
var ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function';
var ENVIRONMENT_IS_WEB = typeof window === 'object';
var ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
var ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
if (ENVIRONMENT_IS_NODE) {
  if (!Module['print'])
    Module['print'] = function print(x) {
      process['stdout'].write(x + '\n');
    };
  if (!Module['printErr'])
    Module['printErr'] = function printErr(x) {
      process['stderr'].write(x + '\n');
    };
  var nodeFS = require('fs');
  var nodePath = require('path');
  Module['read'] = function read(filename, binary) {
    filename = nodePath['normalize'](filename);
    var ret = nodeFS['readFileSync'](filename);
    if (!ret && filename != nodePath['resolve'](filename)) {
      filename = path.join(__dirname, '..', 'src', filename);
      ret = nodeFS['readFileSync'](filename);
    }
    if (ret && !binary) ret = ret.toString();
    return ret;
  };
  Module['readBinary'] = function readBinary(filename) {
    return Module['read'](filename, true);
  };
  Module['load'] = function load(f) {
    globalEval(read(f));
  };
  if (process['argv'].length > 1) {
    Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
  } else {
    Module['thisProgram'] = 'unknown-program';
  }
  Module['arguments'] = process['argv'].slice(2);
  if (typeof module !== 'undefined') {
    module['exports'] = Module;
  }
  process['on']('uncaughtException', function(ex) {
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });
} else if (ENVIRONMENT_IS_SHELL) {
  if (!Module['print']) Module['print'] = print;
  if (typeof printErr != 'undefined') Module['printErr'] = printErr;
  if (typeof read != 'undefined') {
    Module['read'] = read;
  } else {
    Module['read'] = function read() {
      throw 'no read() available (jsc?)';
    };
  }
  Module['readBinary'] = function readBinary(f) {
    if (typeof readbuffer === 'function') {
      return new Uint8Array(readbuffer(f));
    }
    var data = read(f, 'binary');
    assert(typeof data === 'object');
    return data;
  };
  if (typeof scriptArgs != 'undefined') {
    Module['arguments'] = scriptArgs;
  } else if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }
  this['Module'] = Module;
} else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  Module['read'] = function read(url) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.send(null);
    return xhr.responseText;
  };
  if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }
  if (typeof console !== 'undefined') {
    if (!Module['print'])
      Module['print'] = function print(x) {
        console.log(x);
      };
    if (!Module['printErr'])
      Module['printErr'] = function printErr(x) {
        console.log(x);
      };
  } else {
    var TRY_USE_DUMP = false;
    if (!Module['print'])
      Module['print'] =
        TRY_USE_DUMP && typeof dump !== 'undefined'
          ? function(x) {
              dump(x);
            }
          : function(x) {};
  }
  if (ENVIRONMENT_IS_WEB) {
    window['Module'] = Module;
  } else {
    Module['load'] = importScripts;
  }
} else {
  throw 'Unknown runtime environment. Where are we?';
}
function globalEval(x) {
  eval.call(null, x);
}
if (!Module['load'] && Module['read']) {
  Module['load'] = function load(f) {
    globalEval(Module['read'](f));
  };
}
if (!Module['print']) {
  Module['print'] = function() {};
}
if (!Module['printErr']) {
  Module['printErr'] = Module['print'];
}
if (!Module['arguments']) {
  Module['arguments'] = [];
}
if (!Module['thisProgram']) {
  Module['thisProgram'] = './this.program';
}
Module.print = Module['print'];
Module.printErr = Module['printErr'];
Module['preRun'] = [];
Module['postRun'] = [];
for (var key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
var Runtime = {
  setTempRet0: function(value) {
    tempRet0 = value;
  },
  getTempRet0: function() {
    return tempRet0;
  },
  stackSave: function() {
    return STACKTOP;
  },
  stackRestore: function(stackTop) {
    STACKTOP = stackTop;
  },
  getNativeTypeSize: function(type) {
    switch (type) {
      case 'i1':
      case 'i8':
        return 1;
      case 'i16':
        return 2;
      case 'i32':
        return 4;
      case 'i64':
        return 8;
      case 'float':
        return 4;
      case 'double':
        return 8;
      default: {
        if (type[type.length - 1] === '*') {
          return Runtime.QUANTUM_SIZE;
        } else if (type[0] === 'i') {
          var bits = parseInt(type.substr(1));
          assert(bits % 8 === 0);
          return bits / 8;
        } else {
          return 0;
        }
      }
    }
  },
  getNativeFieldSize: function(type) {
    return Math.max(Runtime.getNativeTypeSize(type), Runtime.QUANTUM_SIZE);
  },
  STACK_ALIGN: 16,
  getAlignSize: function(type, size, vararg) {
    if (!vararg && (type == 'i64' || type == 'double')) return 8;
    if (!type) return Math.min(size, 8);
    return Math.min(size || (type ? Runtime.getNativeFieldSize(type) : 0), Runtime.QUANTUM_SIZE);
  },
  dynCall: function(sig, ptr, args) {
    if (args && args.length) {
      if (!args.splice) args = Array.prototype.slice.call(args);
      args.splice(0, 0, ptr);
      return Module['dynCall_' + sig].apply(null, args);
    } else {
      return Module['dynCall_' + sig].call(null, ptr);
    }
  },
  functionPointers: [],
  addFunction: function(func) {
    for (var i = 0; i < Runtime.functionPointers.length; i++) {
      if (!Runtime.functionPointers[i]) {
        Runtime.functionPointers[i] = func;
        return 2 * (1 + i);
      }
    }
    throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';
  },
  removeFunction: function(index) {
    Runtime.functionPointers[(index - 2) / 2] = null;
  },
  getAsmConst: function(code, numArgs) {
    if (!Runtime.asmConstCache) Runtime.asmConstCache = {};
    var func = Runtime.asmConstCache[code];
    if (func) return func;
    var args = [];
    for (var i = 0; i < numArgs; i++) {
      args.push(String.fromCharCode(36) + i);
    }
    var source = Pointer_stringify(code);
    if (source[0] === '"') {
      if (source.indexOf('"', 1) === source.length - 1) {
        source = source.substr(1, source.length - 2);
      } else {
        abort(
          'invalid EM_ASM input |' +
            source +
            '|. Please use EM_ASM(..code..) (no quotes) or EM_ASM({ ..code($0).. }, input) (to input values)'
        );
      }
    }
    try {
      var evalled = eval(
        '(function(Module, FS) { return function(' + args.join(',') + '){ ' + source + ' } })'
      )(Module, typeof FS !== 'undefined' ? FS : null);
    } catch (e) {
      Module.printErr(
        'error in executing inline EM_ASM code: ' +
          e +
          ' on: \n\n' +
          source +
          '\n\nwith args |' +
          args +
          '| (make sure to use the right one out of EM_ASM, EM_ASM_ARGS, etc.)'
      );
      throw e;
    }
    return (Runtime.asmConstCache[code] = evalled);
  },
  warnOnce: function(text) {
    if (!Runtime.warnOnce.shown) Runtime.warnOnce.shown = {};
    if (!Runtime.warnOnce.shown[text]) {
      Runtime.warnOnce.shown[text] = 1;
      Module.printErr(text);
    }
  },
  funcWrappers: {},
  getFuncWrapper: function(func, sig) {
    assert(sig);
    if (!Runtime.funcWrappers[sig]) {
      Runtime.funcWrappers[sig] = {};
    }
    var sigCache = Runtime.funcWrappers[sig];
    if (!sigCache[func]) {
      sigCache[func] = function dynCall_wrapper() {
        return Runtime.dynCall(sig, func, arguments);
      };
    }
    return sigCache[func];
  },
  UTF8Processor: function() {
    var buffer = [];
    var needed = 0;
    this.processCChar = function(code) {
      code = code & 255;
      if (buffer.length == 0) {
        if ((code & 128) == 0) {
          return String.fromCharCode(code);
        }
        buffer.push(code);
        if ((code & 224) == 192) {
          needed = 1;
        } else if ((code & 240) == 224) {
          needed = 2;
        } else {
          needed = 3;
        }
        return '';
      }
      if (needed) {
        buffer.push(code);
        needed--;
        if (needed > 0) return '';
      }
      var c1 = buffer[0];
      var c2 = buffer[1];
      var c3 = buffer[2];
      var c4 = buffer[3];
      var ret;
      if (buffer.length == 2) {
        ret = String.fromCharCode(((c1 & 31) << 6) | (c2 & 63));
      } else if (buffer.length == 3) {
        ret = String.fromCharCode(((c1 & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
      } else {
        var codePoint = ((c1 & 7) << 18) | ((c2 & 63) << 12) | ((c3 & 63) << 6) | (c4 & 63);
        ret = String.fromCharCode(
          (((codePoint - 65536) / 1024) | 0) + 55296,
          ((codePoint - 65536) % 1024) + 56320
        );
      }
      buffer.length = 0;
      return ret;
    };
    this.processJSString = function processJSString(string) {
      string = unescape(encodeURIComponent(string));
      var ret = [];
      for (var i = 0; i < string.length; i++) {
        ret.push(string.charCodeAt(i));
      }
      return ret;
    };
  },
  getCompilerSetting: function(name) {
    throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for Runtime.getCompilerSetting or emscripten_get_compiler_setting to work';
  },
  stackAlloc: function(size) {
    var ret = STACKTOP;
    STACKTOP = (STACKTOP + size) | 0;
    STACKTOP = (STACKTOP + 15) & -16;
    return ret;
  },
  staticAlloc: function(size) {
    var ret = STATICTOP;
    STATICTOP = (STATICTOP + size) | 0;
    STATICTOP = (STATICTOP + 15) & -16;
    return ret;
  },
  dynamicAlloc: function(size) {
    var ret = DYNAMICTOP;
    DYNAMICTOP = (DYNAMICTOP + size) | 0;
    DYNAMICTOP = (DYNAMICTOP + 15) & -16;
    if (DYNAMICTOP >= TOTAL_MEMORY) enlargeMemory();
    return ret;
  },
  alignMemory: function(size, quantum) {
    var ret = (size = Math.ceil(size / (quantum ? quantum : 16)) * (quantum ? quantum : 16));
    return ret;
  },
  makeBigInt: function(low, high, unsigned) {
    var ret = unsigned
      ? +(low >>> 0) + +(high >>> 0) * +4294967296
      : +(low >>> 0) + +(high | 0) * +4294967296;
    return ret;
  },
  GLOBAL_BASE: 8,
  QUANTUM_SIZE: 4,
  __dummy__: 0
};
Module['Runtime'] = Runtime;
var __THREW__ = 0;
var ABORT = false;
var EXITSTATUS = 0;
var undef = 0;
var tempValue,
  tempInt,
  tempBigInt,
  tempInt2,
  tempBigInt2,
  tempPair,
  tempBigIntI,
  tempBigIntR,
  tempBigIntS,
  tempBigIntP,
  tempBigIntD,
  tempDouble,
  tempFloat;
var tempI64, tempI64b;
var tempRet0,
  tempRet1,
  tempRet2,
  tempRet3,
  tempRet4,
  tempRet5,
  tempRet6,
  tempRet7,
  tempRet8,
  tempRet9;
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}
var globalScope = this;
function getCFunc(ident) {
  var func = Module['_' + ident];
  if (!func) {
    try {
      func = eval('_' + ident);
    } catch (e) {}
  }
  assert(
    func,
    'Cannot call unknown function ' + ident + ' (perhaps LLVM optimizations or closure removed it?)'
  );
  return func;
}
var cwrap, ccall;
(function() {
  var stack = 0;
  var JSfuncs = {
    stackSave: function() {
      stack = Runtime.stackSave();
    },
    stackRestore: function() {
      Runtime.stackRestore(stack);
    },
    arrayToC: function(arr) {
      var ret = Runtime.stackAlloc(arr.length);
      writeArrayToMemory(arr, ret);
      return ret;
    },
    stringToC: function(str) {
      var ret = 0;
      if (str !== null && str !== undefined && str !== 0) {
        ret = Runtime.stackAlloc((str.length << 2) + 1);
        writeStringToMemory(str, ret);
      }
      return ret;
    }
  };
  var toC = {string: JSfuncs['stringToC'], array: JSfuncs['arrayToC']};
  ccall = function ccallFunc(ident, returnType, argTypes, args) {
    var func = getCFunc(ident);
    var cArgs = [];
    if (args) {
      for (var i = 0; i < args.length; i++) {
        var converter = toC[argTypes[i]];
        if (converter) {
          if (stack === 0) stack = Runtime.stackSave();
          cArgs[i] = converter(args[i]);
        } else {
          cArgs[i] = args[i];
        }
      }
    }
    var ret = func.apply(null, cArgs);
    if (returnType === 'string') ret = Pointer_stringify(ret);
    if (stack !== 0) JSfuncs['stackRestore']();
    return ret;
  };
  var sourceRegex = /^function\s*\(([^)]*)\)\s*{\s*([^*]*?)[\s;]*(?:return\s*(.*?)[;\s]*)?}$/;
  function parseJSFunc(jsfunc) {
    var parsed = jsfunc
      .toString()
      .match(sourceRegex)
      .slice(1);
    return {arguments: parsed[0], body: parsed[1], returnValue: parsed[2]};
  }
  var JSsource = {};
  for (var fun in JSfuncs) {
    if (JSfuncs.hasOwnProperty(fun)) {
      JSsource[fun] = parseJSFunc(JSfuncs[fun]);
    }
  }
  cwrap = function cwrap(ident, returnType, argTypes) {
    argTypes = argTypes || [];
    var cfunc = getCFunc(ident);
    var numericArgs = argTypes.every(function(type) {
      return type === 'number';
    });
    var numericRet = returnType !== 'string';
    if (numericRet && numericArgs) {
      return cfunc;
    }
    var argNames = argTypes.map(function(x, i) {
      return '$' + i;
    });
    var funcstr = '(function(' + argNames.join(',') + ') {';
    var nargs = argTypes.length;
    if (!numericArgs) {
      funcstr += JSsource['stackSave'].body + ';';
      for (var i = 0; i < nargs; i++) {
        var arg = argNames[i],
          type = argTypes[i];
        if (type === 'number') continue;
        var convertCode = JSsource[type + 'ToC'];
        funcstr += 'var ' + convertCode.arguments + ' = ' + arg + ';';
        funcstr += convertCode.body + ';';
        funcstr += arg + '=' + convertCode.returnValue + ';';
      }
    }
    var cfuncname = parseJSFunc(function() {
      return cfunc;
    }).returnValue;
    funcstr += 'var ret = ' + cfuncname + '(' + argNames.join(',') + ');';
    if (!numericRet) {
      var strgfy = parseJSFunc(function() {
        return Pointer_stringify;
      }).returnValue;
      funcstr += 'ret = ' + strgfy + '(ret);';
    }
    if (!numericArgs) {
      funcstr += JSsource['stackRestore'].body + ';';
    }
    funcstr += 'return ret})';
    return eval(funcstr);
  };
})();
Module['cwrap'] = cwrap;
Module['ccall'] = ccall;
function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length - 1) === '*') type = 'i32';
  switch (type) {
    case 'i1':
      HEAP8[ptr >> 0] = value;
      break;
    case 'i8':
      HEAP8[ptr >> 0] = value;
      break;
    case 'i16':
      HEAP16[ptr >> 1] = value;
      break;
    case 'i32':
      HEAP32[ptr >> 2] = value;
      break;
    case 'i64':
      (tempI64 = [
        value >>> 0,
        ((tempDouble = value),
        +Math_abs(tempDouble) >= +1
          ? tempDouble > +0
            ? (Math_min(+Math_floor(tempDouble / +4294967296), +4294967295) | 0) >>> 0
            : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / +4294967296) >>> 0
          : 0)
      ]),
        (HEAP32[ptr >> 2] = tempI64[0]),
        (HEAP32[(ptr + 4) >> 2] = tempI64[1]);
      break;
    case 'float':
      HEAPF32[ptr >> 2] = value;
      break;
    case 'double':
      HEAPF64[ptr >> 3] = value;
      break;
    default:
      abort('invalid type for setValue: ' + type);
  }
}
Module['setValue'] = setValue;
function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length - 1) === '*') type = 'i32';
  switch (type) {
    case 'i1':
      return HEAP8[ptr >> 0];
    case 'i8':
      return HEAP8[ptr >> 0];
    case 'i16':
      return HEAP16[ptr >> 1];
    case 'i32':
      return HEAP32[ptr >> 2];
    case 'i64':
      return HEAP32[ptr >> 2];
    case 'float':
      return HEAPF32[ptr >> 2];
    case 'double':
      return HEAPF64[ptr >> 3];
    default:
      abort('invalid type for setValue: ' + type);
  }
  return null;
}
Module['getValue'] = getValue;
var ALLOC_NORMAL = 0;
var ALLOC_STACK = 1;
var ALLOC_STATIC = 2;
var ALLOC_DYNAMIC = 3;
var ALLOC_NONE = 4;
Module['ALLOC_NORMAL'] = ALLOC_NORMAL;
Module['ALLOC_STACK'] = ALLOC_STACK;
Module['ALLOC_STATIC'] = ALLOC_STATIC;
Module['ALLOC_DYNAMIC'] = ALLOC_DYNAMIC;
Module['ALLOC_NONE'] = ALLOC_NONE;
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }
  var singleType = typeof types === 'string' ? types : null;
  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [_malloc, Runtime.stackAlloc, Runtime.staticAlloc, Runtime.dynamicAlloc][
      allocator === undefined ? ALLOC_STATIC : allocator
    ](Math.max(size, singleType ? 1 : types.length));
  }
  if (zeroinit) {
    var ptr = ret,
      stop;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[ptr >> 2] = 0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[ptr++ >> 0] = 0;
    }
    return ret;
  }
  if (singleType === 'i8') {
    if (slab.subarray || slab.slice) {
      HEAPU8.set(slab, ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }
  var i = 0,
    type,
    typeSize,
    previousType;
  while (i < size) {
    var curr = slab[i];
    if (typeof curr === 'function') {
      curr = Runtime.getFunctionIndex(curr);
    }
    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }
    if (type == 'i64') type = 'i32';
    setValue(ret + i, curr, type);
    if (previousType !== type) {
      typeSize = Runtime.getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }
  return ret;
}
Module['allocate'] = allocate;
function Pointer_stringify(ptr, length) {
  if (length === 0 || !ptr) return '';
  var hasUtf = false;
  var t;
  var i = 0;
  while (1) {
    t = HEAPU8[(ptr + i) >> 0];
    if (t >= 128) hasUtf = true;
    else if (t == 0 && !length) break;
    i++;
    if (length && i == length) break;
  }
  if (!length) length = i;
  var ret = '';
  if (!hasUtf) {
    var MAX_CHUNK = 1024;
    var curr;
    while (length > 0) {
      curr = String.fromCharCode.apply(
        String,
        HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK))
      );
      ret = ret ? ret + curr : curr;
      ptr += MAX_CHUNK;
      length -= MAX_CHUNK;
    }
    return ret;
  }
  var utf8 = new Runtime.UTF8Processor();
  for (i = 0; i < length; i++) {
    t = HEAPU8[(ptr + i) >> 0];
    ret += utf8.processCChar(t);
  }
  return ret;
}
Module['Pointer_stringify'] = Pointer_stringify;
function UTF16ToString(ptr) {
  var i = 0;
  var str = '';
  while (1) {
    var codeUnit = HEAP16[(ptr + i * 2) >> 1];
    if (codeUnit == 0) return str;
    ++i;
    str += String.fromCharCode(codeUnit);
  }
}
Module['UTF16ToString'] = UTF16ToString;
function stringToUTF16(str, outPtr) {
  for (var i = 0; i < str.length; ++i) {
    var codeUnit = str.charCodeAt(i);
    HEAP16[(outPtr + i * 2) >> 1] = codeUnit;
  }
  HEAP16[(outPtr + str.length * 2) >> 1] = 0;
}
Module['stringToUTF16'] = stringToUTF16;
function UTF32ToString(ptr) {
  var i = 0;
  var str = '';
  while (1) {
    var utf32 = HEAP32[(ptr + i * 4) >> 2];
    if (utf32 == 0) return str;
    ++i;
    if (utf32 >= 65536) {
      var ch = utf32 - 65536;
      str += String.fromCharCode(55296 | (ch >> 10), 56320 | (ch & 1023));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
}
Module['UTF32ToString'] = UTF32ToString;
function stringToUTF32(str, outPtr) {
  var iChar = 0;
  for (var iCodeUnit = 0; iCodeUnit < str.length; ++iCodeUnit) {
    var codeUnit = str.charCodeAt(iCodeUnit);
    if (codeUnit >= 55296 && codeUnit <= 57343) {
      var trailSurrogate = str.charCodeAt(++iCodeUnit);
      codeUnit = (65536 + ((codeUnit & 1023) << 10)) | (trailSurrogate & 1023);
    }
    HEAP32[(outPtr + iChar * 4) >> 2] = codeUnit;
    ++iChar;
  }
  HEAP32[(outPtr + iChar * 4) >> 2] = 0;
}
Module['stringToUTF32'] = stringToUTF32;
function demangle(func) {
  var hasLibcxxabi = !!Module['___cxa_demangle'];
  if (hasLibcxxabi) {
    try {
      var buf = _malloc(func.length);
      writeStringToMemory(func.substr(1), buf);
      var status = _malloc(4);
      var ret = Module['___cxa_demangle'](buf, 0, 0, status);
      if (getValue(status, 'i32') === 0 && ret) {
        return Pointer_stringify(ret);
      }
    } catch (e) {
    } finally {
      if (buf) _free(buf);
      if (status) _free(status);
      if (ret) _free(ret);
    }
  }
  var i = 3;
  var basicTypes = {
    v: 'void',
    b: 'bool',
    c: 'char',
    s: 'short',
    i: 'int',
    l: 'long',
    f: 'float',
    d: 'double',
    w: 'wchar_t',
    a: 'signed char',
    h: 'unsigned char',
    t: 'unsigned short',
    j: 'unsigned int',
    m: 'unsigned long',
    x: 'long long',
    y: 'unsigned long long',
    z: '...'
  };
  var subs = [];
  var first = true;
  function dump(x) {
    if (x) Module.print(x);
    Module.print(func);
    var pre = '';
    for (var a = 0; a < i; a++) pre += ' ';
    Module.print(pre + '^');
  }
  function parseNested() {
    i++;
    if (func[i] === 'K') i++;
    var parts = [];
    while (func[i] !== 'E') {
      if (func[i] === 'S') {
        i++;
        var next = func.indexOf('_', i);
        var num = func.substring(i, next) || 0;
        parts.push(subs[num] || '?');
        i = next + 1;
        continue;
      }
      if (func[i] === 'C') {
        parts.push(parts[parts.length - 1]);
        i += 2;
        continue;
      }
      var size = parseInt(func.substr(i));
      var pre = size.toString().length;
      if (!size || !pre) {
        i--;
        break;
      }
      var curr = func.substr(i + pre, size);
      parts.push(curr);
      subs.push(curr);
      i += pre + size;
    }
    i++;
    return parts;
  }
  function parse(rawList, limit, allowVoid) {
    limit = limit || Infinity;
    var ret = '',
      list = [];
    function flushList() {
      return '(' + list.join(', ') + ')';
    }
    var name;
    if (func[i] === 'N') {
      name = parseNested().join('::');
      limit--;
      if (limit === 0) return rawList ? [name] : name;
    } else {
      if (func[i] === 'K' || (first && func[i] === 'L')) i++;
      var size = parseInt(func.substr(i));
      if (size) {
        var pre = size.toString().length;
        name = func.substr(i + pre, size);
        i += pre + size;
      }
    }
    first = false;
    if (func[i] === 'I') {
      i++;
      var iList = parse(true);
      var iRet = parse(true, 1, true);
      ret += iRet[0] + ' ' + name + '<' + iList.join(', ') + '>';
    } else {
      ret = name;
    }
    paramLoop: while (i < func.length && limit-- > 0) {
      var c = func[i++];
      if (c in basicTypes) {
        list.push(basicTypes[c]);
      } else {
        switch (c) {
          case 'P':
            list.push(parse(true, 1, true)[0] + '*');
            break;
          case 'R':
            list.push(parse(true, 1, true)[0] + '&');
            break;
          case 'L': {
            i++;
            var end = func.indexOf('E', i);
            var size = end - i;
            list.push(func.substr(i, size));
            i += size + 2;
            break;
          }
          case 'A': {
            var size = parseInt(func.substr(i));
            i += size.toString().length;
            if (func[i] !== '_') throw '?';
            i++;
            list.push(parse(true, 1, true)[0] + ' [' + size + ']');
            break;
          }
          case 'E':
            break paramLoop;
          default:
            ret += '?' + c;
            break paramLoop;
        }
      }
    }
    if (!allowVoid && list.length === 1 && list[0] === 'void') list = [];
    if (rawList) {
      if (ret) {
        list.push(ret + '?');
      }
      return list;
    } else {
      return ret + flushList();
    }
  }
  var final = func;
  try {
    if (func == 'Object._main' || func == '_main') {
      return 'main()';
    }
    if (typeof func === 'number') func = Pointer_stringify(func);
    if (func[0] !== '_') return func;
    if (func[1] !== '_') return func;
    if (func[2] !== 'Z') return func;
    switch (func[3]) {
      case 'n':
        return 'operator new()';
      case 'd':
        return 'operator delete()';
    }
    final = parse();
  } catch (e) {
    final += '?';
  }
  if (final.indexOf('?') >= 0 && !hasLibcxxabi) {
    Runtime.warnOnce(
      'warning: a problem occurred in builtin C++ name demangling; build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling'
    );
  }
  return final;
}
function demangleAll(text) {
  return text.replace(/__Z[\w\d_]+/g, function(x) {
    var y = demangle(x);
    return x === y ? x : x + ' [' + y + ']';
  });
}
function jsStackTrace() {
  var err = new Error();
  if (!err.stack) {
    try {
      throw new Error(0);
    } catch (e) {
      err = e;
    }
    if (!err.stack) {
      return '(no stack trace available)';
    }
  }
  return err.stack.toString();
}
function stackTrace() {
  return demangleAll(jsStackTrace());
}
Module['stackTrace'] = stackTrace;
var PAGE_SIZE = 4096;
function alignMemoryPage(x) {
  return (x + 4095) & -4096;
}
var HEAP;
var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
var STATIC_BASE = 0,
  STATICTOP = 0,
  staticSealed = false;
var STACK_BASE = 0,
  STACKTOP = 0,
  STACK_MAX = 0;
var DYNAMIC_BASE = 0,
  DYNAMICTOP = 0;
function enlargeMemory() {
  abort(
    'Cannot enlarge memory arrays. Either (1) compile with -s TOTAL_MEMORY=X with X higher than the current value ' +
      TOTAL_MEMORY +
      ', (2) compile with ALLOW_MEMORY_GROWTH which adjusts the size at runtime but prevents some optimizations, or (3) set Module.TOTAL_MEMORY before the program runs.'
  );
}
var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 117440512;
var FAST_MEMORY = Module['FAST_MEMORY'] || 2097152;
var totalMemory = 64 * 1024;
while (totalMemory < TOTAL_MEMORY || totalMemory < 2 * TOTAL_STACK) {
  if (totalMemory < 16 * 1024 * 1024) {
    totalMemory *= 2;
  } else {
    totalMemory += 16 * 1024 * 1024;
  }
}
if (totalMemory !== TOTAL_MEMORY) {
  Module.printErr(
    'increasing TOTAL_MEMORY to ' + totalMemory + ' to be compliant with the asm.js spec'
  );
  TOTAL_MEMORY = totalMemory;
}
assert(
  typeof Int32Array !== 'undefined' &&
    typeof Float64Array !== 'undefined' &&
    !!new Int32Array(1)['subarray'] &&
    !!new Int32Array(1)['set'],
  'JS engine does not provide full typed array support'
);
var buffer = new ArrayBuffer(TOTAL_MEMORY);
HEAP8 = new Int8Array(buffer);
HEAP16 = new Int16Array(buffer);
HEAP32 = new Int32Array(buffer);
HEAPU8 = new Uint8Array(buffer);
HEAPU16 = new Uint16Array(buffer);
HEAPU32 = new Uint32Array(buffer);
HEAPF32 = new Float32Array(buffer);
HEAPF64 = new Float64Array(buffer);
HEAP32[0] = 255;
assert(
  HEAPU8[0] === 255 && HEAPU8[3] === 0,
  'Typed arrays 2 must be run on a little-endian system'
);
Module['HEAP'] = HEAP;
Module['buffer'] = buffer;
Module['HEAP8'] = HEAP8;
Module['HEAP16'] = HEAP16;
Module['HEAP32'] = HEAP32;
Module['HEAPU8'] = HEAPU8;
Module['HEAPU16'] = HEAPU16;
Module['HEAPU32'] = HEAPU32;
Module['HEAPF32'] = HEAPF32;
Module['HEAPF64'] = HEAPF64;
function callRuntimeCallbacks(callbacks) {
  while (callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback();
      continue;
    }
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Runtime.dynCall('v', func);
      } else {
        Runtime.dynCall('vi', func, [callback.arg]);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}
var __ATPRERUN__ = [];
var __ATINIT__ = [];
var __ATMAIN__ = [];
var __ATEXIT__ = [];
var __ATPOSTRUN__ = [];
var runtimeInitialized = false;
var runtimeExited = false;
function preRun() {
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}
function ensureInitRuntime() {
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}
function preMain() {
  callRuntimeCallbacks(__ATMAIN__);
}
function exitRuntime() {
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}
function postRun() {
  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}
function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}
Module['addOnPreRun'] = Module.addOnPreRun = addOnPreRun;
function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}
Module['addOnInit'] = Module.addOnInit = addOnInit;
function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}
Module['addOnPreMain'] = Module.addOnPreMain = addOnPreMain;
function addOnExit(cb) {
  __ATEXIT__.unshift(cb);
}
Module['addOnExit'] = Module.addOnExit = addOnExit;
function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}
Module['addOnPostRun'] = Module.addOnPostRun = addOnPostRun;
function intArrayFromString(stringy, dontAddNull, length) {
  var ret = new Runtime.UTF8Processor().processJSString(stringy);
  if (length) {
    ret.length = length;
  }
  if (!dontAddNull) {
    ret.push(0);
  }
  return ret;
}
Module['intArrayFromString'] = intArrayFromString;
function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 255) {
      chr &= 255;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}
Module['intArrayToString'] = intArrayToString;
function writeStringToMemory(string, buffer, dontAddNull) {
  var array = intArrayFromString(string, dontAddNull);
  var i = 0;
  while (i < array.length) {
    var chr = array[i];
    HEAP8[(buffer + i) >> 0] = chr;
    i = i + 1;
  }
}
Module['writeStringToMemory'] = writeStringToMemory;
function writeArrayToMemory(array, buffer) {
  for (var i = 0; i < array.length; i++) {
    HEAP8[(buffer + i) >> 0] = array[i];
  }
}
Module['writeArrayToMemory'] = writeArrayToMemory;
function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; i++) {
    HEAP8[(buffer + i) >> 0] = str.charCodeAt(i);
  }
  if (!dontAddNull) HEAP8[(buffer + str.length) >> 0] = 0;
}
Module['writeAsciiToMemory'] = writeAsciiToMemory;
function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2 * Math.abs(1 << (bits - 1)) + value : Math.pow(2, bits) + value;
}
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits - 1)) : Math.pow(2, bits - 1);
  if (value >= half && (bits <= 32 || value > half)) {
    value = -2 * half + value;
  }
  return value;
}
if (!Math['imul'] || Math['imul'](4294967295, 5) !== -5)
  Math['imul'] = function imul(a, b) {
    var ah = a >>> 16;
    var al = a & 65535;
    var bh = b >>> 16;
    var bl = b & 65535;
    return (al * bl + ((ah * bl + al * bh) << 16)) | 0;
  };
Math.imul = Math['imul'];
var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_min = Math.min;
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null;
function addRunDependency(id) {
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
}
Module['addRunDependency'] = addRunDependency;
function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback();
    }
  }
}
Module['removeRunDependency'] = removeRunDependency;
Module['preloadedImages'] = {};
Module['preloadedAudios'] = {};
var memoryInitializer = null;
STATIC_BASE = 8;
STATICTOP = STATIC_BASE + 30128;
__ATINIT__.push(
  {
    func: function() {
      __GLOBAL__I_a();
    }
  },
  {
    func: function() {
      __GLOBAL__I_a64();
    }
  },
  {
    func: function() {
      __GLOBAL__I_a117();
    }
  }
);
allocate(
  [
    76,
    65,
    83,
    90,
    105,
    112,
    0,
    0,
    111,
    112,
    101,
    110,
    0,
    0,
    0,
    0,
    103,
    101,
    116,
    80,
    111,
    105,
    110,
    116,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    103,
    101,
    116,
    67,
    111,
    117,
    110,
    116,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    68,
    121,
    110,
    97,
    109,
    105,
    99,
    76,
    65,
    83,
    90,
    105,
    112,
    0,
    0,
    0,
    97,
    100,
    100,
    70,
    105,
    101,
    108,
    100,
    70,
    108,
    111,
    97,
    116,
    105,
    110,
    103,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    97,
    100,
    100,
    70,
    105,
    101,
    108,
    100,
    83,
    105,
    103,
    110,
    101,
    100,
    0,
    0,
    97,
    100,
    100,
    70,
    105,
    101,
    108,
    100,
    85,
    110,
    115,
    105,
    103,
    110,
    101,
    100,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    118,
    105,
    105,
    105,
    0,
    0,
    0,
    0,
    64,
    110,
    0,
    0,
    208,
    0,
    0,
    0,
    176,
    110,
    0,
    0,
    0,
    0,
    0,
    0,
    80,
    49,
    51,
    68,
    121,
    110,
    97,
    109,
    105,
    99,
    76,
    65,
    83,
    90,
    105,
    112,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    49,
    51,
    68,
    121,
    110,
    97,
    109,
    105,
    99,
    76,
    65,
    83,
    90,
    105,
    112,
    0,
    160,
    109,
    0,
    0,
    184,
    0,
    0,
    0,
    200,
    109,
    0,
    0,
    160,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    200,
    0,
    0,
    0,
    118,
    105,
    105,
    105,
    0,
    0,
    0,
    0,
    64,
    110,
    0,
    0,
    208,
    0,
    0,
    0,
    192,
    110,
    0,
    0,
    0,
    0,
    0,
    0,
    118,
    105,
    105,
    105,
    105,
    0,
    0,
    0,
    64,
    110,
    0,
    0,
    208,
    0,
    0,
    0,
    192,
    110,
    0,
    0,
    192,
    110,
    0,
    0,
    105,
    105,
    0,
    0,
    0,
    0,
    0,
    0,
    208,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    118,
    105,
    0,
    0,
    0,
    0,
    0,
    0,
    105,
    105,
    0,
    0,
    0,
    0,
    0,
    0,
    80,
    75,
    49,
    51,
    68,
    121,
    110,
    97,
    109,
    105,
    99,
    76,
    65,
    83,
    90,
    105,
    112,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    200,
    109,
    0,
    0,
    48,
    1,
    0,
    0,
    1,
    0,
    0,
    0,
    200,
    0,
    0,
    0,
    105,
    105,
    105,
    0,
    0,
    0,
    0,
    0,
    192,
    110,
    0,
    0,
    136,
    1,
    0,
    0,
    80,
    54,
    76,
    65,
    83,
    90,
    105,
    112,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    54,
    76,
    65,
    83,
    90,
    105,
    112,
    0,
    160,
    109,
    0,
    0,
    120,
    1,
    0,
    0,
    200,
    109,
    0,
    0,
    104,
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    128,
    1,
    0,
    0,
    118,
    105,
    105,
    105,
    0,
    0,
    0,
    0,
    64,
    110,
    0,
    0,
    136,
    1,
    0,
    0,
    176,
    110,
    0,
    0,
    0,
    0,
    0,
    0,
    118,
    105,
    105,
    105,
    105,
    0,
    0,
    0,
    64,
    110,
    0,
    0,
    136,
    1,
    0,
    0,
    192,
    110,
    0,
    0,
    192,
    110,
    0,
    0,
    105,
    105,
    0,
    0,
    0,
    0,
    0,
    0,
    136,
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    118,
    105,
    0,
    0,
    0,
    0,
    0,
    0,
    105,
    105,
    0,
    0,
    0,
    0,
    0,
    0,
    80,
    75,
    54,
    76,
    65,
    83,
    90,
    105,
    112,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    200,
    109,
    0,
    0,
    232,
    1,
    0,
    0,
    1,
    0,
    0,
    0,
    128,
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    216,
    2,
    0,
    0,
    1,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    54,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    95,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    49,
    48,
    98,
    117,
    102,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    78,
    83,
    48,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    106,
    78,
    83,
    48,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    106,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    49,
    48,
    98,
    97,
    115,
    101,
    95,
    102,
    105,
    101,
    108,
    100,
    69,
    0,
    0,
    0,
    160,
    109,
    0,
    0,
    176,
    2,
    0,
    0,
    8,
    111,
    0,
    0,
    40,
    2,
    0,
    0,
    208,
    2,
    0,
    0,
    0,
    0,
    0,
    0,
    73,
    110,
    118,
    97,
    108,
    105,
    100,
    32,
    110,
    117,
    109,
    98,
    101,
    114,
    32,
    111,
    102,
    32,
    115,
    121,
    109,
    98,
    111,
    108,
    115,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    4,
    0,
    0,
    3,
    0,
    0,
    0,
    4,
    0,
    0,
    0,
    5,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    50,
    48,
    95,
    95,
    115,
    104,
    97,
    114,
    101,
    100,
    95,
    112,
    116,
    114,
    95,
    112,
    111,
    105,
    110,
    116,
    101,
    114,
    73,
    80,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    54,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    95,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    49,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    49,
    48,
    98,
    117,
    102,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    78,
    83,
    50,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    106,
    78,
    83,
    50,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    106,
    69,
    69,
    69,
    69,
    69,
    69,
    78,
    83,
    95,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    83,
    67,
    95,
    69,
    69,
    78,
    83,
    95,
    57,
    97,
    108,
    108,
    111,
    99,
    97,
    116,
    111,
    114,
    73,
    83,
    67,
    95,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    40,
    3,
    0,
    0,
    184,
    60,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    54,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    95,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    49,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    49,
    48,
    98,
    117,
    102,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    78,
    83,
    50,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    106,
    78,
    83,
    50,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    106,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    88,
    5,
    0,
    0,
    7,
    0,
    0,
    0,
    8,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    3,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    54,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    95,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    49,
    48,
    98,
    117,
    102,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    78,
    83,
    48,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    116,
    78,
    83,
    48,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    116,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    208,
    4,
    0,
    0,
    208,
    2,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    96,
    6,
    0,
    0,
    9,
    0,
    0,
    0,
    10,
    0,
    0,
    0,
    11,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    12,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    50,
    48,
    95,
    95,
    115,
    104,
    97,
    114,
    101,
    100,
    95,
    112,
    116,
    114,
    95,
    112,
    111,
    105,
    110,
    116,
    101,
    114,
    73,
    80,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    54,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    95,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    49,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    49,
    48,
    98,
    117,
    102,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    78,
    83,
    50,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    116,
    78,
    83,
    50,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    116,
    69,
    69,
    69,
    69,
    69,
    69,
    78,
    83,
    95,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    83,
    67,
    95,
    69,
    69,
    78,
    83,
    95,
    57,
    97,
    108,
    108,
    111,
    99,
    97,
    116,
    111,
    114,
    73,
    83,
    67,
    95,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    136,
    5,
    0,
    0,
    184,
    60,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    54,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    95,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    49,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    49,
    48,
    98,
    117,
    102,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    78,
    83,
    50,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    116,
    78,
    83,
    50,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    116,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    184,
    7,
    0,
    0,
    13,
    0,
    0,
    0,
    14,
    0,
    0,
    0,
    3,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    4,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    54,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    95,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    49,
    48,
    98,
    117,
    102,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    78,
    83,
    48,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    104,
    78,
    83,
    48,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    104,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    48,
    7,
    0,
    0,
    208,
    2,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    192,
    8,
    0,
    0,
    15,
    0,
    0,
    0,
    16,
    0,
    0,
    0,
    17,
    0,
    0,
    0,
    3,
    0,
    0,
    0,
    18,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    50,
    48,
    95,
    95,
    115,
    104,
    97,
    114,
    101,
    100,
    95,
    112,
    116,
    114,
    95,
    112,
    111,
    105,
    110,
    116,
    101,
    114,
    73,
    80,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    54,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    95,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    49,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    49,
    48,
    98,
    117,
    102,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    78,
    83,
    50,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    104,
    78,
    83,
    50,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    104,
    69,
    69,
    69,
    69,
    69,
    69,
    78,
    83,
    95,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    83,
    67,
    95,
    69,
    69,
    78,
    83,
    95,
    57,
    97,
    108,
    108,
    111,
    99,
    97,
    116,
    111,
    114,
    73,
    83,
    67,
    95,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    232,
    7,
    0,
    0,
    184,
    60,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    54,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    95,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    49,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    49,
    48,
    98,
    117,
    102,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    78,
    83,
    50,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    104,
    78,
    83,
    50,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    104,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    24,
    10,
    0,
    0,
    19,
    0,
    0,
    0,
    20,
    0,
    0,
    0,
    4,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    5,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    54,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    95,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    49,
    48,
    98,
    117,
    102,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    78,
    83,
    48,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    105,
    78,
    83,
    48,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    105,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    144,
    9,
    0,
    0,
    208,
    2,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    32,
    11,
    0,
    0,
    21,
    0,
    0,
    0,
    22,
    0,
    0,
    0,
    23,
    0,
    0,
    0,
    4,
    0,
    0,
    0,
    24,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    50,
    48,
    95,
    95,
    115,
    104,
    97,
    114,
    101,
    100,
    95,
    112,
    116,
    114,
    95,
    112,
    111,
    105,
    110,
    116,
    101,
    114,
    73,
    80,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    54,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    95,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    49,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    49,
    48,
    98,
    117,
    102,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    78,
    83,
    50,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    105,
    78,
    83,
    50,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    105,
    69,
    69,
    69,
    69,
    69,
    69,
    78,
    83,
    95,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    83,
    67,
    95,
    69,
    69,
    78,
    83,
    95,
    57,
    97,
    108,
    108,
    111,
    99,
    97,
    116,
    111,
    114,
    73,
    83,
    67,
    95,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    72,
    10,
    0,
    0,
    184,
    60,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    54,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    95,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    49,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    49,
    48,
    98,
    117,
    102,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    78,
    83,
    50,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    105,
    78,
    83,
    50,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    105,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    120,
    12,
    0,
    0,
    25,
    0,
    0,
    0,
    26,
    0,
    0,
    0,
    5,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    54,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    95,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    49,
    48,
    98,
    117,
    102,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    78,
    83,
    48,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    115,
    78,
    83,
    48,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    115,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    240,
    11,
    0,
    0,
    208,
    2,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    128,
    13,
    0,
    0,
    27,
    0,
    0,
    0,
    28,
    0,
    0,
    0,
    29,
    0,
    0,
    0,
    5,
    0,
    0,
    0,
    30,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    50,
    48,
    95,
    95,
    115,
    104,
    97,
    114,
    101,
    100,
    95,
    112,
    116,
    114,
    95,
    112,
    111,
    105,
    110,
    116,
    101,
    114,
    73,
    80,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    54,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    95,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    49,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    49,
    48,
    98,
    117,
    102,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    78,
    83,
    50,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    115,
    78,
    83,
    50,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    115,
    69,
    69,
    69,
    69,
    69,
    69,
    78,
    83,
    95,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    83,
    67,
    95,
    69,
    69,
    78,
    83,
    95,
    57,
    97,
    108,
    108,
    111,
    99,
    97,
    116,
    111,
    114,
    73,
    83,
    67,
    95,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    168,
    12,
    0,
    0,
    184,
    60,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    54,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    95,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    49,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    49,
    48,
    98,
    117,
    102,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    78,
    83,
    50,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    115,
    78,
    83,
    50,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    115,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    216,
    14,
    0,
    0,
    31,
    0,
    0,
    0,
    32,
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    7,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    54,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    95,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    49,
    48,
    98,
    117,
    102,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    78,
    83,
    48,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    97,
    78,
    83,
    48,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    97,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    80,
    14,
    0,
    0,
    208,
    2,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    224,
    15,
    0,
    0,
    33,
    0,
    0,
    0,
    34,
    0,
    0,
    0,
    35,
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    36,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    50,
    48,
    95,
    95,
    115,
    104,
    97,
    114,
    101,
    100,
    95,
    112,
    116,
    114,
    95,
    112,
    111,
    105,
    110,
    116,
    101,
    114,
    73,
    80,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    54,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    95,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    49,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    49,
    48,
    98,
    117,
    102,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    78,
    83,
    50,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    97,
    78,
    83,
    50,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    97,
    69,
    69,
    69,
    69,
    69,
    69,
    78,
    83,
    95,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    83,
    67,
    95,
    69,
    69,
    78,
    83,
    95,
    57,
    97,
    108,
    108,
    111,
    99,
    97,
    116,
    111,
    114,
    73,
    83,
    67,
    95,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    8,
    15,
    0,
    0,
    184,
    60,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    54,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    95,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    49,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    49,
    48,
    98,
    117,
    102,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    78,
    83,
    50,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    97,
    78,
    83,
    50,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    97,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    48,
    17,
    0,
    0,
    8,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    38,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    54,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    102,
    105,
    101,
    108,
    100,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    73,
    78,
    83,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    49,
    48,
    98,
    117,
    102,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    69,
    69,
    0,
    0,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    48,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    69,
    0,
    160,
    109,
    0,
    0,
    0,
    17,
    0,
    0,
    8,
    111,
    0,
    0,
    168,
    16,
    0,
    0,
    40,
    17,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    18,
    0,
    0,
    39,
    0,
    0,
    0,
    40,
    0,
    0,
    0,
    41,
    0,
    0,
    0,
    7,
    0,
    0,
    0,
    42,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    50,
    48,
    95,
    95,
    115,
    104,
    97,
    114,
    101,
    100,
    95,
    112,
    116,
    114,
    95,
    112,
    111,
    105,
    110,
    116,
    101,
    114,
    73,
    80,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    54,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    102,
    105,
    101,
    108,
    100,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    73,
    78,
    83,
    49,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    49,
    48,
    98,
    117,
    102,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    69,
    69,
    78,
    83,
    95,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    83,
    56,
    95,
    69,
    69,
    78,
    83,
    95,
    57,
    97,
    108,
    108,
    111,
    99,
    97,
    116,
    111,
    114,
    73,
    83,
    56,
    95,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    96,
    17,
    0,
    0,
    184,
    60,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    54,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    102,
    105,
    101,
    108,
    100,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    73,
    78,
    83,
    49,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    49,
    48,
    98,
    117,
    102,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    48,
    19,
    0,
    0,
    43,
    0,
    0,
    0,
    44,
    0,
    0,
    0,
    45,
    0,
    0,
    0,
    8,
    0,
    0,
    0,
    46,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    50,
    48,
    95,
    95,
    115,
    104,
    97,
    114,
    101,
    100,
    95,
    112,
    116,
    114,
    95,
    112,
    111,
    105,
    110,
    116,
    101,
    114,
    73,
    80,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    49,
    48,
    98,
    117,
    102,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    78,
    83,
    95,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    83,
    53,
    95,
    69,
    69,
    78,
    83,
    95,
    57,
    97,
    108,
    108,
    111,
    99,
    97,
    116,
    111,
    114,
    73,
    83,
    53,
    95,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    176,
    18,
    0,
    0,
    184,
    60,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    49,
    48,
    98,
    117,
    102,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    20,
    0,
    0,
    47,
    0,
    0,
    0,
    48,
    0,
    0,
    0,
    49,
    0,
    0,
    0,
    9,
    0,
    0,
    0,
    50,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    50,
    48,
    95,
    95,
    115,
    104,
    97,
    114,
    101,
    100,
    95,
    112,
    116,
    114,
    95,
    112,
    111,
    105,
    110,
    116,
    101,
    114,
    73,
    80,
    49,
    48,
    98,
    117,
    102,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    78,
    83,
    95,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    83,
    49,
    95,
    69,
    69,
    78,
    83,
    95,
    57,
    97,
    108,
    108,
    111,
    99,
    97,
    116,
    111,
    114,
    73,
    83,
    49,
    95,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    168,
    19,
    0,
    0,
    184,
    60,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    49,
    48,
    98,
    117,
    102,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    0,
    0,
    118,
    50,
    116,
    54,
    115,
    50,
    48,
    0,
    118,
    50,
    116,
    54,
    115,
    50,
    48,
    118,
    50,
    116,
    55,
    115,
    56,
    0,
    0,
    0,
    118,
    50,
    116,
    54,
    115,
    50,
    48,
    118,
    50,
    116,
    56,
    115,
    54,
    0,
    0,
    0,
    118,
    50,
    116,
    54,
    115,
    50,
    48,
    118,
    50,
    116,
    55,
    115,
    56,
    118,
    50,
    116,
    56,
    115,
    54,
    0,
    0,
    0,
    0,
    0,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    49,
    57,
    117,
    110,
    107,
    110,
    111,
    119,
    110,
    95,
    115,
    99,
    104,
    101,
    109,
    97,
    95,
    116,
    121,
    112,
    101,
    69,
    0,
    0,
    8,
    111,
    0,
    0,
    128,
    20,
    0,
    0,
    72,
    108,
    0,
    0,
    0,
    0,
    0,
    0,
    84,
    104,
    101,
    32,
    76,
    65,
    90,
    32,
    115,
    99,
    104,
    101,
    109,
    97,
    32,
    105,
    115,
    32,
    110,
    111,
    116,
    32,
    114,
    101,
    99,
    111,
    103,
    110,
    105,
    122,
    101,
    100,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    160,
    20,
    0,
    0,
    51,
    0,
    0,
    0,
    52,
    0,
    0,
    0,
    7,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    32,
    22,
    0,
    0,
    9,
    0,
    0,
    0,
    53,
    0,
    0,
    0,
    54,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    49,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    49,
    73,
    78,
    83,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    78,
    83,
    95,
    50,
    105,
    111,
    49,
    56,
    95,
    95,
    105,
    102,
    115,
    116,
    114,
    101,
    97,
    109,
    95,
    119,
    114,
    97,
    112,
    112,
    101,
    114,
    73,
    78,
    83,
    95,
    55,
    115,
    116,
    114,
    101,
    97,
    109,
    115,
    49,
    51,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    69,
    69,
    69,
    78,
    83,
    48,
    95,
    49,
    57,
    114,
    101,
    99,
    111,
    114,
    100,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    73,
    74,
    78,
    83,
    48,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    48,
    95,
    51,
    108,
    97,
    115,
    55,
    112,
    111,
    105,
    110,
    116,
    49,
    48,
    69,
    78,
    83,
    48,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    83,
    68,
    95,
    69,
    69,
    69,
    69,
    78,
    83,
    66,
    95,
    73,
    78,
    83,
    67,
    95,
    55,
    103,
    112,
    115,
    116,
    105,
    109,
    101,
    69,
    78,
    83,
    69,
    95,
    73,
    83,
    72,
    95,
    69,
    69,
    69,
    69,
    78,
    83,
    66,
    95,
    73,
    78,
    83,
    67,
    95,
    51,
    114,
    103,
    98,
    69,
    78,
    83,
    69,
    95,
    73,
    83,
    75,
    95,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    8,
    21,
    0,
    0,
    40,
    17,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    49,
    49,
    101,
    110,
    100,
    95,
    111,
    102,
    95,
    102,
    105,
    108,
    101,
    69,
    0,
    0,
    8,
    111,
    0,
    0,
    48,
    22,
    0,
    0,
    72,
    108,
    0,
    0,
    0,
    0,
    0,
    0,
    82,
    101,
    97,
    99,
    104,
    101,
    100,
    32,
    69,
    110,
    100,
    32,
    111,
    102,
    32,
    102,
    105,
    108,
    101,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    72,
    22,
    0,
    0,
    55,
    0,
    0,
    0,
    56,
    0,
    0,
    0,
    7,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    15,
    14,
    13,
    12,
    11,
    10,
    9,
    8,
    14,
    0,
    1,
    3,
    6,
    10,
    10,
    9,
    13,
    1,
    2,
    4,
    7,
    11,
    11,
    10,
    12,
    3,
    4,
    5,
    8,
    12,
    12,
    11,
    11,
    6,
    7,
    8,
    9,
    13,
    13,
    12,
    10,
    10,
    11,
    12,
    13,
    14,
    14,
    13,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
    14,
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    1,
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    2,
    1,
    0,
    1,
    2,
    3,
    4,
    5,
    3,
    2,
    1,
    0,
    1,
    2,
    3,
    4,
    4,
    3,
    2,
    1,
    0,
    1,
    2,
    3,
    5,
    4,
    3,
    2,
    1,
    0,
    1,
    2,
    6,
    5,
    4,
    3,
    2,
    1,
    0,
    1,
    7,
    6,
    5,
    4,
    3,
    2,
    1,
    0,
    0,
    0,
    0,
    0,
    144,
    24,
    0,
    0,
    57,
    0,
    0,
    0,
    58,
    0,
    0,
    0,
    59,
    0,
    0,
    0,
    10,
    0,
    0,
    0,
    60,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    50,
    48,
    95,
    95,
    115,
    104,
    97,
    114,
    101,
    100,
    95,
    112,
    116,
    114,
    95,
    112,
    111,
    105,
    110,
    116,
    101,
    114,
    73,
    80,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    49,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    49,
    73,
    78,
    83,
    49,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    78,
    83,
    49,
    95,
    50,
    105,
    111,
    49,
    56,
    95,
    95,
    105,
    102,
    115,
    116,
    114,
    101,
    97,
    109,
    95,
    119,
    114,
    97,
    112,
    112,
    101,
    114,
    73,
    78,
    83,
    49,
    95,
    55,
    115,
    116,
    114,
    101,
    97,
    109,
    115,
    49,
    51,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    69,
    69,
    69,
    78,
    83,
    50,
    95,
    49,
    57,
    114,
    101,
    99,
    111,
    114,
    100,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    73,
    74,
    78,
    83,
    50,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    50,
    95,
    51,
    108,
    97,
    115,
    55,
    112,
    111,
    105,
    110,
    116,
    49,
    48,
    69,
    78,
    83,
    50,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    83,
    70,
    95,
    69,
    69,
    69,
    69,
    78,
    83,
    68,
    95,
    73,
    78,
    83,
    69,
    95,
    55,
    103,
    112,
    115,
    116,
    105,
    109,
    101,
    69,
    78,
    83,
    71,
    95,
    73,
    83,
    74,
    95,
    69,
    69,
    69,
    69,
    78,
    83,
    68,
    95,
    73,
    78,
    83,
    69,
    95,
    51,
    114,
    103,
    98,
    69,
    78,
    83,
    71,
    95,
    73,
    83,
    77,
    95,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    78,
    83,
    95,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    83,
    81,
    95,
    69,
    69,
    78,
    83,
    95,
    57,
    97,
    108,
    108,
    111,
    99,
    97,
    116,
    111,
    114,
    73,
    83,
    81,
    95,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    40,
    23,
    0,
    0,
    184,
    60,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    49,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    49,
    73,
    78,
    83,
    49,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    78,
    83,
    49,
    95,
    50,
    105,
    111,
    49,
    56,
    95,
    95,
    105,
    102,
    115,
    116,
    114,
    101,
    97,
    109,
    95,
    119,
    114,
    97,
    112,
    112,
    101,
    114,
    73,
    78,
    83,
    49,
    95,
    55,
    115,
    116,
    114,
    101,
    97,
    109,
    115,
    49,
    51,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    69,
    69,
    69,
    78,
    83,
    50,
    95,
    49,
    57,
    114,
    101,
    99,
    111,
    114,
    100,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    73,
    74,
    78,
    83,
    50,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    50,
    95,
    51,
    108,
    97,
    115,
    55,
    112,
    111,
    105,
    110,
    116,
    49,
    48,
    69,
    78,
    83,
    50,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    83,
    70,
    95,
    69,
    69,
    69,
    69,
    78,
    83,
    68,
    95,
    73,
    78,
    83,
    69,
    95,
    55,
    103,
    112,
    115,
    116,
    105,
    109,
    101,
    69,
    78,
    83,
    71,
    95,
    73,
    83,
    74,
    95,
    69,
    69,
    69,
    69,
    78,
    83,
    68,
    95,
    73,
    78,
    83,
    69,
    95,
    51,
    114,
    103,
    98,
    69,
    78,
    83,
    71,
    95,
    73,
    83,
    77,
    95,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    224,
    26,
    0,
    0,
    10,
    0,
    0,
    0,
    61,
    0,
    0,
    0,
    62,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    49,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    49,
    73,
    78,
    83,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    78,
    83,
    95,
    50,
    105,
    111,
    49,
    56,
    95,
    95,
    105,
    102,
    115,
    116,
    114,
    101,
    97,
    109,
    95,
    119,
    114,
    97,
    112,
    112,
    101,
    114,
    73,
    78,
    83,
    95,
    55,
    115,
    116,
    114,
    101,
    97,
    109,
    115,
    49,
    51,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    69,
    69,
    69,
    78,
    83,
    48,
    95,
    49,
    57,
    114,
    101,
    99,
    111,
    114,
    100,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    73,
    74,
    78,
    83,
    48,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    48,
    95,
    51,
    108,
    97,
    115,
    55,
    112,
    111,
    105,
    110,
    116,
    49,
    48,
    69,
    78,
    83,
    48,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    83,
    68,
    95,
    69,
    69,
    69,
    69,
    78,
    83,
    66,
    95,
    73,
    78,
    83,
    67,
    95,
    51,
    114,
    103,
    98,
    69,
    78,
    83,
    69,
    95,
    73,
    83,
    72,
    95,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    232,
    25,
    0,
    0,
    40,
    17,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    88,
    28,
    0,
    0,
    63,
    0,
    0,
    0,
    64,
    0,
    0,
    0,
    65,
    0,
    0,
    0,
    11,
    0,
    0,
    0,
    66,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    50,
    48,
    95,
    95,
    115,
    104,
    97,
    114,
    101,
    100,
    95,
    112,
    116,
    114,
    95,
    112,
    111,
    105,
    110,
    116,
    101,
    114,
    73,
    80,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    49,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    49,
    73,
    78,
    83,
    49,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    78,
    83,
    49,
    95,
    50,
    105,
    111,
    49,
    56,
    95,
    95,
    105,
    102,
    115,
    116,
    114,
    101,
    97,
    109,
    95,
    119,
    114,
    97,
    112,
    112,
    101,
    114,
    73,
    78,
    83,
    49,
    95,
    55,
    115,
    116,
    114,
    101,
    97,
    109,
    115,
    49,
    51,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    69,
    69,
    69,
    78,
    83,
    50,
    95,
    49,
    57,
    114,
    101,
    99,
    111,
    114,
    100,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    73,
    74,
    78,
    83,
    50,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    50,
    95,
    51,
    108,
    97,
    115,
    55,
    112,
    111,
    105,
    110,
    116,
    49,
    48,
    69,
    78,
    83,
    50,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    83,
    70,
    95,
    69,
    69,
    69,
    69,
    78,
    83,
    68,
    95,
    73,
    78,
    83,
    69,
    95,
    51,
    114,
    103,
    98,
    69,
    78,
    83,
    71,
    95,
    73,
    83,
    74,
    95,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    78,
    83,
    95,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    83,
    78,
    95,
    69,
    69,
    78,
    83,
    95,
    57,
    97,
    108,
    108,
    111,
    99,
    97,
    116,
    111,
    114,
    73,
    83,
    78,
    95,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    16,
    27,
    0,
    0,
    184,
    60,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    49,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    49,
    73,
    78,
    83,
    49,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    78,
    83,
    49,
    95,
    50,
    105,
    111,
    49,
    56,
    95,
    95,
    105,
    102,
    115,
    116,
    114,
    101,
    97,
    109,
    95,
    119,
    114,
    97,
    112,
    112,
    101,
    114,
    73,
    78,
    83,
    49,
    95,
    55,
    115,
    116,
    114,
    101,
    97,
    109,
    115,
    49,
    51,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    69,
    69,
    69,
    78,
    83,
    50,
    95,
    49,
    57,
    114,
    101,
    99,
    111,
    114,
    100,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    73,
    74,
    78,
    83,
    50,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    50,
    95,
    51,
    108,
    97,
    115,
    55,
    112,
    111,
    105,
    110,
    116,
    49,
    48,
    69,
    78,
    83,
    50,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    83,
    70,
    95,
    69,
    69,
    69,
    69,
    78,
    83,
    68,
    95,
    73,
    78,
    83,
    69,
    95,
    51,
    114,
    103,
    98,
    69,
    78,
    83,
    71,
    95,
    73,
    83,
    74,
    95,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    144,
    30,
    0,
    0,
    11,
    0,
    0,
    0,
    67,
    0,
    0,
    0,
    68,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    49,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    49,
    73,
    78,
    83,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    78,
    83,
    95,
    50,
    105,
    111,
    49,
    56,
    95,
    95,
    105,
    102,
    115,
    116,
    114,
    101,
    97,
    109,
    95,
    119,
    114,
    97,
    112,
    112,
    101,
    114,
    73,
    78,
    83,
    95,
    55,
    115,
    116,
    114,
    101,
    97,
    109,
    115,
    49,
    51,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    69,
    69,
    69,
    78,
    83,
    48,
    95,
    49,
    57,
    114,
    101,
    99,
    111,
    114,
    100,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    73,
    74,
    78,
    83,
    48,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    48,
    95,
    51,
    108,
    97,
    115,
    55,
    112,
    111,
    105,
    110,
    116,
    49,
    48,
    69,
    78,
    83,
    48,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    83,
    68,
    95,
    69,
    69,
    69,
    69,
    78,
    83,
    66,
    95,
    73,
    78,
    83,
    67,
    95,
    55,
    103,
    112,
    115,
    116,
    105,
    109,
    101,
    69,
    78,
    83,
    69,
    95,
    73,
    83,
    72,
    95,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    8,
    111,
    0,
    0,
    152,
    29,
    0,
    0,
    40,
    17,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    32,
    0,
    0,
    69,
    0,
    0,
    0,
    70,
    0,
    0,
    0,
    71,
    0,
    0,
    0,
    12,
    0,
    0,
    0,
    72,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    50,
    48,
    95,
    95,
    115,
    104,
    97,
    114,
    101,
    100,
    95,
    112,
    116,
    114,
    95,
    112,
    111,
    105,
    110,
    116,
    101,
    114,
    73,
    80,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    49,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    49,
    73,
    78,
    83,
    49,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    78,
    83,
    49,
    95,
    50,
    105,
    111,
    49,
    56,
    95,
    95,
    105,
    102,
    115,
    116,
    114,
    101,
    97,
    109,
    95,
    119,
    114,
    97,
    112,
    112,
    101,
    114,
    73,
    78,
    83,
    49,
    95,
    55,
    115,
    116,
    114,
    101,
    97,
    109,
    115,
    49,
    51,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    69,
    69,
    69,
    78,
    83,
    50,
    95,
    49,
    57,
    114,
    101,
    99,
    111,
    114,
    100,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    73,
    74,
    78,
    83,
    50,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    50,
    95,
    51,
    108,
    97,
    115,
    55,
    112,
    111,
    105,
    110,
    116,
    49,
    48,
    69,
    78,
    83,
    50,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    83,
    70,
    95,
    69,
    69,
    69,
    69,
    78,
    83,
    68,
    95,
    73,
    78,
    83,
    69,
    95,
    55,
    103,
    112,
    115,
    116,
    105,
    109,
    101,
    69,
    78,
    83,
    71,
    95,
    73,
    83,
    74,
    95,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    78,
    83,
    95,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    83,
    78,
    95,
    69,
    69,
    78,
    83,
    95,
    57,
    97,
    108,
    108,
    111,
    99,
    97,
    116,
    111,
    114,
    73,
    83,
    78,
    95,
    69,
    69,
    69,
    69,
    0,
    8,
    111,
    0,
    0,
    192,
    30,
    0,
    0,
    184,
    60,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    49,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    49,
    73,
    78,
    83,
    49,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    78,
    83,
    49,
    95,
    50,
    105,
    111,
    49,
    56,
    95,
    95,
    105,
    102,
    115,
    116,
    114,
    101,
    97,
    109,
    95,
    119,
    114,
    97,
    112,
    112,
    101,
    114,
    73,
    78,
    83,
    49,
    95,
    55,
    115,
    116,
    114,
    101,
    97,
    109,
    115,
    49,
    51,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    69,
    69,
    69,
    78,
    83,
    50,
    95,
    49,
    57,
    114,
    101,
    99,
    111,
    114,
    100,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    73,
    74,
    78,
    83,
    50,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    50,
    95,
    51,
    108,
    97,
    115,
    55,
    112,
    111,
    105,
    110,
    116,
    49,
    48,
    69,
    78,
    83,
    50,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    83,
    70,
    95,
    69,
    69,
    69,
    69,
    78,
    83,
    68,
    95,
    73,
    78,
    83,
    69,
    95,
    55,
    103,
    112,
    115,
    116,
    105,
    109,
    101,
    69,
    78,
    83,
    71,
    95,
    73,
    83,
    74,
    95,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    40,
    34,
    0,
    0,
    12,
    0,
    0,
    0,
    73,
    0,
    0,
    0,
    74,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    49,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    49,
    73,
    78,
    83,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    78,
    83,
    95,
    50,
    105,
    111,
    49,
    56,
    95,
    95,
    105,
    102,
    115,
    116,
    114,
    101,
    97,
    109,
    95,
    119,
    114,
    97,
    112,
    112,
    101,
    114,
    73,
    78,
    83,
    95,
    55,
    115,
    116,
    114,
    101,
    97,
    109,
    115,
    49,
    51,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    69,
    69,
    69,
    78,
    83,
    48,
    95,
    49,
    57,
    114,
    101,
    99,
    111,
    114,
    100,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    73,
    74,
    78,
    83,
    48,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    48,
    95,
    51,
    108,
    97,
    115,
    55,
    112,
    111,
    105,
    110,
    116,
    49,
    48,
    69,
    78,
    83,
    48,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    83,
    68,
    95,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    72,
    33,
    0,
    0,
    40,
    17,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    136,
    35,
    0,
    0,
    75,
    0,
    0,
    0,
    76,
    0,
    0,
    0,
    77,
    0,
    0,
    0,
    13,
    0,
    0,
    0,
    78,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    50,
    48,
    95,
    95,
    115,
    104,
    97,
    114,
    101,
    100,
    95,
    112,
    116,
    114,
    95,
    112,
    111,
    105,
    110,
    116,
    101,
    114,
    73,
    80,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    49,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    49,
    73,
    78,
    83,
    49,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    78,
    83,
    49,
    95,
    50,
    105,
    111,
    49,
    56,
    95,
    95,
    105,
    102,
    115,
    116,
    114,
    101,
    97,
    109,
    95,
    119,
    114,
    97,
    112,
    112,
    101,
    114,
    73,
    78,
    83,
    49,
    95,
    55,
    115,
    116,
    114,
    101,
    97,
    109,
    115,
    49,
    51,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    69,
    69,
    69,
    78,
    83,
    50,
    95,
    49,
    57,
    114,
    101,
    99,
    111,
    114,
    100,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    73,
    74,
    78,
    83,
    50,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    50,
    95,
    51,
    108,
    97,
    115,
    55,
    112,
    111,
    105,
    110,
    116,
    49,
    48,
    69,
    78,
    83,
    50,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    83,
    70,
    95,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    78,
    83,
    95,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    83,
    75,
    95,
    69,
    69,
    78,
    83,
    95,
    57,
    97,
    108,
    108,
    111,
    99,
    97,
    116,
    111,
    114,
    73,
    83,
    75,
    95,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    88,
    34,
    0,
    0,
    184,
    60,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    102,
    111,
    114,
    109,
    97,
    116,
    115,
    50,
    49,
    100,
    121,
    110,
    97,
    109,
    105,
    99,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    49,
    73,
    78,
    83,
    49,
    95,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    78,
    83,
    49,
    95,
    50,
    105,
    111,
    49,
    56,
    95,
    95,
    105,
    102,
    115,
    116,
    114,
    101,
    97,
    109,
    95,
    119,
    114,
    97,
    112,
    112,
    101,
    114,
    73,
    78,
    83,
    49,
    95,
    55,
    115,
    116,
    114,
    101,
    97,
    109,
    115,
    49,
    51,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    69,
    69,
    69,
    78,
    83,
    50,
    95,
    49,
    57,
    114,
    101,
    99,
    111,
    114,
    100,
    95,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    73,
    74,
    78,
    83,
    50,
    95,
    53,
    102,
    105,
    101,
    108,
    100,
    73,
    78,
    83,
    50,
    95,
    51,
    108,
    97,
    115,
    55,
    112,
    111,
    105,
    110,
    116,
    49,
    48,
    69,
    78,
    83,
    50,
    95,
    50,
    48,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    95,
    100,
    105,
    102,
    102,
    95,
    109,
    101,
    116,
    104,
    111,
    100,
    73,
    83,
    70,
    95,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    118,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    116,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    115,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    64,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    48,
    37,
    0,
    0,
    79,
    0,
    0,
    0,
    80,
    0,
    0,
    0,
    56,
    0,
    0,
    0,
    248,
    255,
    255,
    255,
    48,
    37,
    0,
    0,
    81,
    0,
    0,
    0,
    82,
    0,
    0,
    0,
    192,
    255,
    255,
    255,
    192,
    255,
    255,
    255,
    48,
    37,
    0,
    0,
    83,
    0,
    0,
    0,
    84,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    56,
    98,
    97,
    115,
    105,
    99,
    95,
    115,
    116,
    114,
    105,
    110,
    103,
    115,
    116,
    114,
    101,
    97,
    109,
    73,
    99,
    78,
    83,
    95,
    49,
    49,
    99,
    104,
    97,
    114,
    95,
    116,
    114,
    97,
    105,
    116,
    115,
    73,
    99,
    69,
    69,
    78,
    83,
    95,
    57,
    97,
    108,
    108,
    111,
    99,
    97,
    116,
    111,
    114,
    73,
    99,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    232,
    36,
    0,
    0,
    176,
    67,
    0,
    0,
    0,
    0,
    0,
    0,
    64,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    144,
    66,
    0,
    0,
    85,
    0,
    0,
    0,
    86,
    0,
    0,
    0,
    192,
    255,
    255,
    255,
    192,
    255,
    255,
    255,
    144,
    66,
    0,
    0,
    87,
    0,
    0,
    0,
    88,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    240,
    37,
    0,
    0,
    89,
    0,
    0,
    0,
    90,
    0,
    0,
    0,
    13,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    8,
    0,
    0,
    0,
    9,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    10,
    0,
    0,
    0,
    11,
    0,
    0,
    0,
    14,
    0,
    0,
    0,
    3,
    0,
    0,
    0,
    15,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    53,
    98,
    97,
    115,
    105,
    99,
    95,
    115,
    116,
    114,
    105,
    110,
    103,
    98,
    117,
    102,
    73,
    99,
    78,
    83,
    95,
    49,
    49,
    99,
    104,
    97,
    114,
    95,
    116,
    114,
    97,
    105,
    116,
    115,
    73,
    99,
    69,
    69,
    78,
    83,
    95,
    57,
    97,
    108,
    108,
    111,
    99,
    97,
    116,
    111,
    114,
    73,
    99,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    168,
    37,
    0,
    0,
    24,
    66,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    200,
    38,
    0,
    0,
    91,
    0,
    0,
    0,
    92,
    0,
    0,
    0,
    93,
    0,
    0,
    0,
    16,
    0,
    0,
    0,
    94,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    50,
    48,
    95,
    95,
    115,
    104,
    97,
    114,
    101,
    100,
    95,
    112,
    116,
    114,
    95,
    112,
    111,
    105,
    110,
    116,
    101,
    114,
    73,
    80,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    78,
    83,
    49,
    95,
    50,
    105,
    111,
    49,
    56,
    95,
    95,
    105,
    102,
    115,
    116,
    114,
    101,
    97,
    109,
    95,
    119,
    114,
    97,
    112,
    112,
    101,
    114,
    73,
    78,
    83,
    49,
    95,
    55,
    115,
    116,
    114,
    101,
    97,
    109,
    115,
    49,
    51,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    69,
    69,
    69,
    78,
    83,
    95,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    83,
    57,
    95,
    69,
    69,
    78,
    83,
    95,
    57,
    97,
    108,
    108,
    111,
    99,
    97,
    116,
    111,
    114,
    73,
    83,
    57,
    95,
    69,
    69,
    69,
    69,
    0,
    8,
    111,
    0,
    0,
    32,
    38,
    0,
    0,
    184,
    60,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    56,
    100,
    101,
    99,
    111,
    100,
    101,
    114,
    115,
    49,
    48,
    97,
    114,
    105,
    116,
    104,
    109,
    101,
    116,
    105,
    99,
    73,
    78,
    83,
    49,
    95,
    50,
    105,
    111,
    49,
    56,
    95,
    95,
    105,
    102,
    115,
    116,
    114,
    101,
    97,
    109,
    95,
    119,
    114,
    97,
    112,
    112,
    101,
    114,
    73,
    78,
    83,
    49,
    95,
    55,
    115,
    116,
    114,
    101,
    97,
    109,
    115,
    49,
    51,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    71,
    111,
    116,
    32,
    100,
    97,
    116,
    97,
    32,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    32,
    98,
    121,
    116,
    101,
    115,
    0,
    0,
    76,
    65,
    83,
    70,
    0,
    0,
    0,
    0,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    49,
    51,
    105,
    110,
    118,
    97,
    108,
    105,
    100,
    95,
    109,
    97,
    103,
    105,
    99,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    112,
    39,
    0,
    0,
    72,
    108,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    50,
    50,
    99,
    104,
    117,
    110,
    107,
    95,
    116,
    97,
    98,
    108,
    101,
    95,
    114,
    101,
    97,
    100,
    95,
    101,
    114,
    114,
    111,
    114,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    160,
    39,
    0,
    0,
    72,
    108,
    0,
    0,
    0,
    0,
    0,
    0,
    67,
    104,
    117,
    110,
    107,
    32,
    116,
    97,
    98,
    108,
    101,
    32,
    111,
    102,
    102,
    115,
    101,
    116,
    32,
    61,
    61,
    32,
    45,
    49,
    32,
    105,
    115,
    32,
    110,
    111,
    116,
    32,
    115,
    117,
    112,
    112,
    111,
    114,
    116,
    101,
    100,
    32,
    97,
    116,
    32,
    116,
    104,
    105
  ],
  'i8',
  ALLOC_NONE,
  Runtime.GLOBAL_BASE
);
allocate(
  [
    115,
    32,
    116,
    105,
    109,
    101,
    0,
    0,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    49,
    51,
    110,
    111,
    116,
    95,
    115,
    117,
    112,
    112,
    111,
    114,
    116,
    101,
    100,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    16,
    40,
    0,
    0,
    72,
    108,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    50,
    54,
    117,
    110,
    107,
    110,
    111,
    119,
    110,
    95,
    99,
    104,
    117,
    110,
    107,
    95,
    116,
    97,
    98,
    108,
    101,
    95,
    102,
    111,
    114,
    109,
    97,
    116,
    69,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    64,
    40,
    0,
    0,
    72,
    108,
    0,
    0,
    0,
    0,
    0,
    0,
    99,
    104,
    117,
    110,
    107,
    95,
    115,
    105,
    122,
    101,
    32,
    61,
    61,
    32,
    117,
    105,
    110,
    116,
    46,
    109,
    97,
    120,
    32,
    105,
    115,
    32,
    110,
    111,
    116,
    32,
    115,
    117,
    112,
    112,
    111,
    114,
    116,
    101,
    100,
    32,
    97,
    116,
    32,
    116,
    104,
    105,
    115,
    32,
    116,
    105,
    109,
    101,
    44,
    32,
    99,
    97,
    108,
    108,
    32,
    49,
    45,
    56,
    48,
    48,
    45,
    68,
    65,
    70,
    85,
    81,
    32,
    102,
    111,
    114,
    32,
    115,
    117,
    112,
    112,
    111,
    114,
    116,
    46,
    0,
    0,
    0,
    0,
    0,
    84,
    104,
    101,
    32,
    99,
    104,
    117,
    110,
    107,
    32,
    116,
    97,
    98,
    108,
    101,
    32,
    118,
    101,
    114,
    115,
    105,
    111,
    110,
    32,
    110,
    117,
    109,
    98,
    101,
    114,
    32,
    105,
    115,
    32,
    117,
    110,
    107,
    110,
    111,
    119,
    110,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    104,
    40,
    0,
    0,
    95,
    0,
    0,
    0,
    96,
    0,
    0,
    0,
    7,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    48,
    40,
    0,
    0,
    97,
    0,
    0,
    0,
    98,
    0,
    0,
    0,
    7,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    84,
    104,
    101,
    114,
    101,
    32,
    119,
    97,
    115,
    32,
    97,
    32,
    112,
    114,
    111,
    98,
    108,
    101,
    109,
    32,
    114,
    101,
    97,
    100,
    105,
    110,
    103,
    32,
    116,
    104,
    101,
    32,
    99,
    104,
    117,
    110,
    107,
    32,
    116,
    97,
    98,
    108,
    101,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    200,
    39,
    0,
    0,
    99,
    0,
    0,
    0,
    100,
    0,
    0,
    0,
    7,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    108,
    97,
    115,
    122,
    105,
    112,
    32,
    101,
    110,
    99,
    111,
    100,
    101,
    100,
    0,
    0,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    49,
    51,
    110,
    111,
    95,
    108,
    97,
    115,
    122,
    105,
    112,
    95,
    118,
    108,
    114,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    136,
    41,
    0,
    0,
    72,
    108,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    111,
    32,
    76,
    65,
    83,
    122,
    105,
    112,
    32,
    86,
    76,
    82,
    32,
    119,
    97,
    115,
    32,
    102,
    111,
    117,
    110,
    100,
    32,
    105,
    110,
    32,
    116,
    104,
    101,
    32,
    86,
    76,
    82,
    115,
    32,
    115,
    101,
    99,
    116,
    105,
    111,
    110,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    168,
    41,
    0,
    0,
    101,
    0,
    0,
    0,
    102,
    0,
    0,
    0,
    7,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    50,
    53,
    108,
    97,
    115,
    122,
    105,
    112,
    95,
    102,
    111,
    114,
    109,
    97,
    116,
    95,
    117,
    110,
    115,
    117,
    112,
    112,
    111,
    114,
    116,
    101,
    100,
    69,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    0,
    42,
    0,
    0,
    72,
    108,
    0,
    0,
    0,
    0,
    0,
    0,
    79,
    110,
    108,
    121,
    32,
    76,
    65,
    83,
    122,
    105,
    112,
    32,
    80,
    79,
    73,
    78,
    84,
    87,
    73,
    83,
    69,
    32,
    67,
    72,
    85,
    78,
    75,
    69,
    68,
    32,
    100,
    101,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    111,
    114,
    32,
    105,
    115,
    32,
    115,
    117,
    112,
    112,
    111,
    114,
    116,
    101,
    100,
    0,
    0,
    0,
    0,
    0,
    40,
    42,
    0,
    0,
    103,
    0,
    0,
    0,
    104,
    0,
    0,
    0,
    7,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    55,
    98,
    97,
    100,
    95,
    102,
    117,
    110,
    99,
    116,
    105,
    111,
    110,
    95,
    99,
    97,
    108,
    108,
    69,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    136,
    42,
    0,
    0,
    88,
    107,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    168,
    42,
    0,
    0,
    105,
    0,
    0,
    0,
    106,
    0,
    0,
    0,
    12,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    16,
    44,
    0,
    0,
    107,
    0,
    0,
    0,
    108,
    0,
    0,
    0,
    13,
    0,
    0,
    0,
    14,
    0,
    0,
    0,
    109,
    0,
    0,
    0,
    110,
    0,
    0,
    0,
    15,
    0,
    0,
    0,
    17,
    0,
    0,
    0,
    14,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    48,
    95,
    95,
    102,
    117,
    110,
    99,
    116,
    105,
    111,
    110,
    54,
    95,
    95,
    102,
    117,
    110,
    99,
    73,
    90,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    50,
    105,
    111,
    54,
    114,
    101,
    97,
    100,
    101,
    114,
    49,
    48,
    98,
    97,
    115,
    105,
    99,
    95,
    102,
    105,
    108,
    101,
    73,
    78,
    83,
    50,
    95,
    55,
    115,
    116,
    114,
    101,
    97,
    109,
    115,
    49,
    51,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    49,
    49,
    95,
    118,
    97,
    108,
    105,
    100,
    97,
    116,
    111,
    114,
    115,
    69,
    118,
    69,
    85,
    108,
    82,
    78,
    83,
    51,
    95,
    54,
    104,
    101,
    97,
    100,
    101,
    114,
    69,
    69,
    95,
    78,
    83,
    95,
    57,
    97,
    108,
    108,
    111,
    99,
    97,
    116,
    111,
    114,
    73,
    83,
    66,
    95,
    69,
    69,
    70,
    118,
    83,
    65,
    95,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    48,
    95,
    95,
    102,
    117,
    110,
    99,
    116,
    105,
    111,
    110,
    54,
    95,
    95,
    98,
    97,
    115,
    101,
    73,
    70,
    118,
    82,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    50,
    105,
    111,
    54,
    104,
    101,
    97,
    100,
    101,
    114,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    160,
    109,
    0,
    0,
    208,
    43,
    0,
    0,
    8,
    111,
    0,
    0,
    56,
    43,
    0,
    0,
    8,
    44,
    0,
    0,
    0,
    0,
    0,
    0,
    90,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    50,
    105,
    111,
    54,
    114,
    101,
    97,
    100,
    101,
    114,
    49,
    48,
    98,
    97,
    115,
    105,
    99,
    95,
    102,
    105,
    108,
    101,
    73,
    78,
    83,
    95,
    55,
    115,
    116,
    114,
    101,
    97,
    109,
    115,
    49,
    51,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    49,
    49,
    95,
    118,
    97,
    108,
    105,
    100,
    97,
    116,
    111,
    114,
    115,
    69,
    118,
    69,
    85,
    108,
    82,
    78,
    83,
    48,
    95,
    54,
    104,
    101,
    97,
    100,
    101,
    114,
    69,
    69,
    95,
    0,
    0,
    0,
    160,
    109,
    0,
    0,
    32,
    44,
    0,
    0,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    50,
    49,
    111,
    108,
    100,
    95,
    115,
    116,
    121,
    108,
    101,
    95,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    105,
    111,
    110,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    136,
    44,
    0,
    0,
    72,
    108,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    49,
    52,
    110,
    111,
    116,
    95,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    101,
    100,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    192,
    44,
    0,
    0,
    72,
    108,
    0,
    0,
    0,
    0,
    0,
    0,
    84,
    104,
    101,
    32,
    102,
    105,
    108,
    101,
    32,
    100,
    111,
    101,
    115,
    110,
    39,
    116,
    32,
    115,
    101,
    101,
    109,
    32,
    116,
    111,
    32,
    98,
    101,
    32,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    101,
    100,
    0,
    0,
    0,
    0,
    0,
    0,
    224,
    44,
    0,
    0,
    111,
    0,
    0,
    0,
    112,
    0,
    0,
    0,
    7,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    84,
    104,
    101,
    32,
    102,
    105,
    108,
    101,
    32,
    115,
    101,
    101,
    109,
    115,
    32,
    116,
    111,
    32,
    104,
    97,
    118,
    101,
    32,
    111,
    108,
    100,
    32,
    115,
    116,
    121,
    108,
    101,
    32,
    99,
    111,
    109,
    112,
    114,
    101,
    115,
    115,
    105,
    111,
    110,
    32,
    119,
    104,
    105,
    99,
    104,
    32,
    105,
    115,
    32,
    110,
    111,
    116,
    32,
    115,
    117,
    112,
    112,
    111,
    114,
    116,
    101,
    100,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    176,
    44,
    0,
    0,
    113,
    0,
    0,
    0,
    114,
    0,
    0,
    0,
    7,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    70,
    105,
    108,
    101,
    32,
    109,
    97,
    103,
    105,
    99,
    32,
    105,
    115,
    32,
    110,
    111,
    116,
    32,
    118,
    97,
    108,
    105,
    100,
    0,
    0,
    0,
    0,
    0,
    144,
    39,
    0,
    0,
    115,
    0,
    0,
    0,
    116,
    0,
    0,
    0,
    7,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    112,
    46,
    0,
    0,
    117,
    0,
    0,
    0,
    118,
    0,
    0,
    0,
    119,
    0,
    0,
    0,
    18,
    0,
    0,
    0,
    120,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    50,
    48,
    95,
    95,
    115,
    104,
    97,
    114,
    101,
    100,
    95,
    112,
    116,
    114,
    95,
    112,
    111,
    105,
    110,
    116,
    101,
    114,
    73,
    80,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    50,
    105,
    111,
    54,
    114,
    101,
    97,
    100,
    101,
    114,
    49,
    48,
    98,
    97,
    115,
    105,
    99,
    95,
    102,
    105,
    108,
    101,
    73,
    78,
    83,
    49,
    95,
    55,
    115,
    116,
    114,
    101,
    97,
    109,
    115,
    49,
    51,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    69,
    78,
    83,
    95,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    83,
    55,
    95,
    69,
    69,
    78,
    83,
    95,
    57,
    97,
    108,
    108,
    111,
    99,
    97,
    116,
    111,
    114,
    73,
    83,
    55,
    95,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    224,
    45,
    0,
    0,
    184,
    60,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    50,
    105,
    111,
    54,
    114,
    101,
    97,
    100,
    101,
    114,
    49,
    48,
    98,
    97,
    115,
    105,
    99,
    95,
    102,
    105,
    108,
    101,
    73,
    78,
    83,
    49,
    95,
    55,
    115,
    116,
    114,
    101,
    97,
    109,
    115,
    49,
    51,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    104,
    47,
    0,
    0,
    121,
    0,
    0,
    0,
    122,
    0,
    0,
    0,
    123,
    0,
    0,
    0,
    19,
    0,
    0,
    0,
    124,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    50,
    48,
    95,
    95,
    115,
    104,
    97,
    114,
    101,
    100,
    95,
    112,
    116,
    114,
    95,
    112,
    111,
    105,
    110,
    116,
    101,
    114,
    73,
    80,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    115,
    116,
    114,
    101,
    97,
    109,
    115,
    49,
    51,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    78,
    83,
    95,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    83,
    51,
    95,
    69,
    69,
    78,
    83,
    95,
    57,
    97,
    108,
    108,
    111,
    99,
    97,
    116,
    111,
    114,
    73,
    83,
    51,
    95,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    248,
    46,
    0,
    0,
    184,
    60,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    52,
    100,
    101,
    102,
    97,
    117,
    108,
    116,
    95,
    100,
    101,
    108,
    101,
    116,
    101,
    73,
    78,
    54,
    108,
    97,
    115,
    122,
    105,
    112,
    55,
    115,
    116,
    114,
    101,
    97,
    109,
    115,
    49,
    51,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    118,
    111,
    105,
    100,
    0,
    0,
    0,
    0,
    98,
    111,
    111,
    108,
    0,
    0,
    0,
    0,
    99,
    104,
    97,
    114,
    0,
    0,
    0,
    0,
    115,
    105,
    103,
    110,
    101,
    100,
    32,
    99,
    104,
    97,
    114,
    0,
    0,
    0,
    0,
    0,
    117,
    110,
    115,
    105,
    103,
    110,
    101,
    100,
    32,
    99,
    104,
    97,
    114,
    0,
    0,
    0,
    115,
    104,
    111,
    114,
    116,
    0,
    0,
    0,
    117,
    110,
    115,
    105,
    103,
    110,
    101,
    100,
    32,
    115,
    104,
    111,
    114,
    116,
    0,
    0,
    105,
    110,
    116,
    0,
    0,
    0,
    0,
    0,
    117,
    110,
    115,
    105,
    103,
    110,
    101,
    100,
    32,
    105,
    110,
    116,
    0,
    0,
    0,
    0,
    108,
    111,
    110,
    103,
    0,
    0,
    0,
    0,
    117,
    110,
    115,
    105,
    103,
    110,
    101,
    100,
    32,
    108,
    111,
    110,
    103,
    0,
    0,
    0,
    102,
    108,
    111,
    97,
    116,
    0,
    0,
    0,
    100,
    111,
    117,
    98,
    108,
    101,
    0,
    0,
    115,
    116,
    100,
    58,
    58,
    115,
    116,
    114,
    105,
    110,
    103,
    0,
    0,
    0,
    0,
    0,
    115,
    116,
    100,
    58,
    58,
    98,
    97,
    115,
    105,
    99,
    95,
    115,
    116,
    114,
    105,
    110,
    103,
    60,
    117,
    110,
    115,
    105,
    103,
    110,
    101,
    100,
    32,
    99,
    104,
    97,
    114,
    62,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    115,
    116,
    100,
    58,
    58,
    119,
    115,
    116,
    114,
    105,
    110,
    103,
    0,
    0,
    0,
    0,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    58,
    58,
    118,
    97,
    108,
    0,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    58,
    58,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    60,
    99,
    104,
    97,
    114,
    62,
    0,
    0,
    0,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    58,
    58,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    60,
    115,
    105,
    103,
    110,
    101,
    100,
    32,
    99,
    104,
    97,
    114,
    62,
    0,
    0,
    0,
    0,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    58,
    58,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    60,
    117,
    110,
    115,
    105,
    103,
    110,
    101,
    100,
    32,
    99,
    104,
    97,
    114,
    62,
    0,
    0,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    58,
    58,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    60,
    115,
    104,
    111,
    114,
    116,
    62,
    0,
    0,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    58,
    58,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    60,
    117,
    110,
    115,
    105,
    103,
    110,
    101,
    100,
    32,
    115,
    104,
    111,
    114,
    116,
    62,
    0,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    58,
    58,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    60,
    105,
    110,
    116,
    62,
    0,
    0,
    0,
    0,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    58,
    58,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    60,
    117,
    110,
    115,
    105,
    103,
    110,
    101,
    100,
    32,
    105,
    110,
    116,
    62,
    0,
    0,
    0,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    58,
    58,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    60,
    108,
    111,
    110,
    103,
    62,
    0,
    0,
    0,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    58,
    58,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    60,
    117,
    110,
    115,
    105,
    103,
    110,
    101,
    100,
    32,
    108,
    111,
    110,
    103,
    62,
    0,
    0,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    58,
    58,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    60,
    105,
    110,
    116,
    56,
    95,
    116,
    62,
    0,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    58,
    58,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    60,
    117,
    105,
    110,
    116,
    56,
    95,
    116,
    62,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    58,
    58,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    60,
    105,
    110,
    116,
    49,
    54,
    95,
    116,
    62,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    58,
    58,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    60,
    117,
    105,
    110,
    116,
    49,
    54,
    95,
    116,
    62,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    58,
    58,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    60,
    105,
    110,
    116,
    51,
    50,
    95,
    116,
    62,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    58,
    58,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    60,
    117,
    105,
    110,
    116,
    51,
    50,
    95,
    116,
    62,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    58,
    58,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    60,
    102,
    108,
    111,
    97,
    116,
    62,
    0,
    0,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    58,
    58,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    60,
    100,
    111,
    117,
    98,
    108,
    101,
    62,
    0,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    58,
    58,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    60,
    108,
    111,
    110,
    103,
    32,
    100,
    111,
    117,
    98,
    108,
    101,
    62,
    0,
    0,
    0,
    0,
    78,
    49,
    48,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    49,
    49,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    73,
    101,
    69,
    69,
    0,
    0,
    160,
    109,
    0,
    0,
    56,
    51,
    0,
    0,
    78,
    49,
    48,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    49,
    49,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    73,
    100,
    69,
    69,
    0,
    0,
    160,
    109,
    0,
    0,
    96,
    51,
    0,
    0,
    78,
    49,
    48,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    49,
    49,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    73,
    102,
    69,
    69,
    0,
    0,
    160,
    109,
    0,
    0,
    136,
    51,
    0,
    0,
    78,
    49,
    48,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    49,
    49,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    73,
    109,
    69,
    69,
    0,
    0,
    160,
    109,
    0,
    0,
    176,
    51,
    0,
    0,
    78,
    49,
    48,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    49,
    49,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    73,
    108,
    69,
    69,
    0,
    0,
    160,
    109,
    0,
    0,
    216,
    51,
    0,
    0,
    78,
    49,
    48,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    49,
    49,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    73,
    106,
    69,
    69,
    0,
    0,
    160,
    109,
    0,
    0,
    0,
    52,
    0,
    0,
    78,
    49,
    48,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    49,
    49,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    73,
    105,
    69,
    69,
    0,
    0,
    160,
    109,
    0,
    0,
    40,
    52,
    0,
    0,
    78,
    49,
    48,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    49,
    49,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    73,
    116,
    69,
    69,
    0,
    0,
    160,
    109,
    0,
    0,
    80,
    52,
    0,
    0,
    78,
    49,
    48,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    49,
    49,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    73,
    115,
    69,
    69,
    0,
    0,
    160,
    109,
    0,
    0,
    120,
    52,
    0,
    0,
    78,
    49,
    48,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    49,
    49,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    73,
    104,
    69,
    69,
    0,
    0,
    160,
    109,
    0,
    0,
    160,
    52,
    0,
    0,
    78,
    49,
    48,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    49,
    49,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    73,
    97,
    69,
    69,
    0,
    0,
    160,
    109,
    0,
    0,
    200,
    52,
    0,
    0,
    78,
    49,
    48,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    49,
    49,
    109,
    101,
    109,
    111,
    114,
    121,
    95,
    118,
    105,
    101,
    119,
    73,
    99,
    69,
    69,
    0,
    0,
    160,
    109,
    0,
    0,
    240,
    52,
    0,
    0,
    78,
    49,
    48,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    51,
    118,
    97,
    108,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    160,
    109,
    0,
    0,
    24,
    53,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    50,
    98,
    97,
    115,
    105,
    99,
    95,
    115,
    116,
    114,
    105,
    110,
    103,
    73,
    119,
    78,
    83,
    95,
    49,
    49,
    99,
    104,
    97,
    114,
    95,
    116,
    114,
    97,
    105,
    116,
    115,
    73,
    119,
    69,
    69,
    78,
    83,
    95,
    57,
    97,
    108,
    108,
    111,
    99,
    97,
    116,
    111,
    114,
    73,
    119,
    69,
    69,
    69,
    69,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    50,
    49,
    95,
    95,
    98,
    97,
    115,
    105,
    99,
    95,
    115,
    116,
    114,
    105,
    110,
    103,
    95,
    99,
    111,
    109,
    109,
    111,
    110,
    73,
    76,
    98,
    49,
    69,
    69,
    69,
    0,
    0,
    0,
    160,
    109,
    0,
    0,
    120,
    53,
    0,
    0,
    104,
    111,
    0,
    0,
    56,
    53,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    160,
    53,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    50,
    98,
    97,
    115,
    105,
    99,
    95,
    115,
    116,
    114,
    105,
    110,
    103,
    73,
    104,
    78,
    83,
    95,
    49,
    49,
    99,
    104,
    97,
    114,
    95,
    116,
    114,
    97,
    105,
    116,
    115,
    73,
    104,
    69,
    69,
    78,
    83,
    95,
    57,
    97,
    108,
    108,
    111,
    99,
    97,
    116,
    111,
    114,
    73,
    104,
    69,
    69,
    69,
    69,
    0,
    0,
    104,
    111,
    0,
    0,
    192,
    53,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    160,
    53,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    50,
    98,
    97,
    115,
    105,
    99,
    95,
    115,
    116,
    114,
    105,
    110,
    103,
    73,
    99,
    78,
    83,
    95,
    49,
    49,
    99,
    104,
    97,
    114,
    95,
    116,
    114,
    97,
    105,
    116,
    115,
    73,
    99,
    69,
    69,
    78,
    83,
    95,
    57,
    97,
    108,
    108,
    111,
    99,
    97,
    116,
    111,
    114,
    73,
    99,
    69,
    69,
    69,
    69,
    0,
    0,
    104,
    111,
    0,
    0,
    24,
    54,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    160,
    53
  ],
  'i8',
  ALLOC_NONE,
  Runtime.GLOBAL_BASE + 10240
);
allocate(
  [
    248,
    58,
    0,
    0,
    125,
    0,
    0,
    0,
    126,
    0,
    0,
    0,
    16,
    0,
    0,
    0,
    4,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    15,
    0,
    0,
    0,
    16,
    0,
    0,
    0,
    5,
    0,
    0,
    0,
    17,
    0,
    0,
    0,
    18,
    0,
    0,
    0,
    20,
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    21,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    49,
    95,
    95,
    115,
    116,
    100,
    111,
    117,
    116,
    98,
    117,
    102,
    73,
    119,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    216,
    58,
    0,
    0,
    88,
    66,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    96,
    59,
    0,
    0,
    127,
    0,
    0,
    0,
    128,
    0,
    0,
    0,
    17,
    0,
    0,
    0,
    4,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    19,
    0,
    0,
    0,
    16,
    0,
    0,
    0,
    5,
    0,
    0,
    0,
    20,
    0,
    0,
    0,
    21,
    0,
    0,
    0,
    22,
    0,
    0,
    0,
    7,
    0,
    0,
    0,
    23,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    48,
    95,
    95,
    115,
    116,
    100,
    105,
    110,
    98,
    117,
    102,
    73,
    119,
    69,
    69,
    0,
    8,
    111,
    0,
    0,
    72,
    59,
    0,
    0,
    88,
    66,
    0,
    0,
    0,
    0,
    0,
    0,
    117,
    110,
    115,
    117,
    112,
    112,
    111,
    114,
    116,
    101,
    100,
    32,
    108,
    111,
    99,
    97,
    108,
    101,
    32,
    102,
    111,
    114,
    32,
    115,
    116,
    97,
    110,
    100,
    97,
    114,
    100,
    32,
    105,
    110,
    112,
    117,
    116,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    248,
    59,
    0,
    0,
    129,
    0,
    0,
    0,
    130,
    0,
    0,
    0,
    18,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    3,
    0,
    0,
    0,
    3,
    0,
    0,
    0,
    22,
    0,
    0,
    0,
    9,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    23,
    0,
    0,
    0,
    11,
    0,
    0,
    0,
    24,
    0,
    0,
    0,
    8,
    0,
    0,
    0,
    25,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    49,
    95,
    95,
    115,
    116,
    100,
    111,
    117,
    116,
    98,
    117,
    102,
    73,
    99,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    216,
    59,
    0,
    0,
    24,
    66,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    96,
    60,
    0,
    0,
    131,
    0,
    0,
    0,
    132,
    0,
    0,
    0,
    19,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    3,
    0,
    0,
    0,
    3,
    0,
    0,
    0,
    8,
    0,
    0,
    0,
    9,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    24,
    0,
    0,
    0,
    25,
    0,
    0,
    0,
    26,
    0,
    0,
    0,
    3,
    0,
    0,
    0,
    27,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    48,
    95,
    95,
    115,
    116,
    100,
    105,
    110,
    98,
    117,
    102,
    73,
    99,
    69,
    69,
    0,
    8,
    111,
    0,
    0,
    72,
    60,
    0,
    0,
    24,
    66,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    52,
    95,
    95,
    115,
    104,
    97,
    114,
    101,
    100,
    95,
    99,
    111,
    117,
    110,
    116,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    160,
    109,
    0,
    0,
    112,
    60,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    57,
    95,
    95,
    115,
    104,
    97,
    114,
    101,
    100,
    95,
    119,
    101,
    97,
    107,
    95,
    99,
    111,
    117,
    110,
    116,
    69,
    0,
    0,
    0,
    104,
    111,
    0,
    0,
    152,
    60,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    144,
    60,
    0,
    0,
    0,
    0,
    0,
    0,
    103,
    101,
    110,
    101,
    114,
    105,
    99,
    0,
    117,
    110,
    115,
    112,
    101,
    99,
    105,
    102,
    105,
    101,
    100,
    32,
    103,
    101,
    110,
    101,
    114,
    105,
    99,
    95,
    99,
    97,
    116,
    101,
    103,
    111,
    114,
    121,
    32,
    101,
    114,
    114,
    111,
    114,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    115,
    121,
    115,
    116,
    101,
    109,
    0,
    0,
    117,
    110,
    115,
    112,
    101,
    99,
    105,
    102,
    105,
    101,
    100,
    32,
    115,
    121,
    115,
    116,
    101,
    109,
    95,
    99,
    97,
    116,
    101,
    103,
    111,
    114,
    121,
    32,
    101,
    114,
    114,
    111,
    114,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    58,
    32,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    136,
    61,
    0,
    0,
    133,
    0,
    0,
    0,
    134,
    0,
    0,
    0,
    7,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    50,
    115,
    121,
    115,
    116,
    101,
    109,
    95,
    101,
    114,
    114,
    111,
    114,
    69,
    0,
    0,
    8,
    111,
    0,
    0,
    112,
    61,
    0,
    0,
    72,
    108,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    52,
    101,
    114,
    114,
    111,
    114,
    95,
    99,
    97,
    116,
    101,
    103,
    111,
    114,
    121,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    160,
    109,
    0,
    0,
    152,
    61,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    50,
    95,
    95,
    100,
    111,
    95,
    109,
    101,
    115,
    115,
    97,
    103,
    101,
    69,
    0,
    0,
    8,
    111,
    0,
    0,
    192,
    61,
    0,
    0,
    184,
    61,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    56,
    62,
    0,
    0,
    135,
    0,
    0,
    0,
    136,
    0,
    0,
    0,
    26,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    9,
    0,
    0,
    0,
    10,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    50,
    52,
    95,
    95,
    103,
    101,
    110,
    101,
    114,
    105,
    99,
    95,
    101,
    114,
    114,
    111,
    114,
    95,
    99,
    97,
    116,
    101,
    103,
    111,
    114,
    121,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    16,
    62,
    0,
    0,
    216,
    61,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    152,
    62,
    0,
    0,
    137,
    0,
    0,
    0,
    138,
    0,
    0,
    0,
    27,
    0,
    0,
    0,
    3,
    0,
    0,
    0,
    9,
    0,
    0,
    0,
    10,
    0,
    0,
    0,
    4,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    50,
    51,
    95,
    95,
    115,
    121,
    115,
    116,
    101,
    109,
    95,
    101,
    114,
    114,
    111,
    114,
    95,
    99,
    97,
    116,
    101,
    103,
    111,
    114,
    121,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    112,
    62,
    0,
    0,
    216,
    61,
    0,
    0,
    0,
    0,
    0,
    0,
    109,
    117,
    116,
    101,
    120,
    32,
    108,
    111,
    99,
    107,
    32,
    102,
    97,
    105,
    108,
    101,
    100,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    101,
    99,
    32,
    61,
    61,
    32,
    48,
    0,
    47,
    85,
    115,
    101,
    114,
    115,
    47,
    118,
    101,
    114,
    109,
    97,
    47,
    116,
    109,
    112,
    47,
    101,
    109,
    115,
    100,
    107,
    47,
    101,
    109,
    115,
    99,
    114,
    105,
    112,
    116,
    101,
    110,
    47,
    49,
    46,
    50,
    55,
    46,
    48,
    47,
    115,
    121,
    115,
    116,
    101,
    109,
    47,
    108,
    105,
    98,
    47,
    108,
    105,
    98,
    99,
    120,
    120,
    47,
    109,
    117,
    116,
    101,
    120,
    46,
    99,
    112,
    112,
    0,
    0,
    0,
    0,
    117,
    110,
    108,
    111,
    99,
    107,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    98,
    97,
    115,
    105,
    99,
    95,
    115,
    116,
    114,
    105,
    110,
    103,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    24,
    66,
    0,
    0,
    139,
    0,
    0,
    0,
    140,
    0,
    0,
    0,
    13,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    3,
    0,
    0,
    0,
    3,
    0,
    0,
    0,
    8,
    0,
    0,
    0,
    9,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    23,
    0,
    0,
    0,
    11,
    0,
    0,
    0,
    24,
    0,
    0,
    0,
    3,
    0,
    0,
    0,
    27,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    88,
    66,
    0,
    0,
    141,
    0,
    0,
    0,
    142,
    0,
    0,
    0,
    20,
    0,
    0,
    0,
    4,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    19,
    0,
    0,
    0,
    16,
    0,
    0,
    0,
    5,
    0,
    0,
    0,
    17,
    0,
    0,
    0,
    18,
    0,
    0,
    0,
    20,
    0,
    0,
    0,
    7,
    0,
    0,
    0,
    23,
    0,
    0,
    0,
    8,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    144,
    66,
    0,
    0,
    85,
    0,
    0,
    0,
    86,
    0,
    0,
    0,
    248,
    255,
    255,
    255,
    248,
    255,
    255,
    255,
    144,
    66,
    0,
    0,
    87,
    0,
    0,
    0,
    88,
    0,
    0,
    0,
    8,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    216,
    66,
    0,
    0,
    143,
    0,
    0,
    0,
    144,
    0,
    0,
    0,
    248,
    255,
    255,
    255,
    248,
    255,
    255,
    255,
    216,
    66,
    0,
    0,
    145,
    0,
    0,
    0,
    146,
    0,
    0,
    0,
    4,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    32,
    67,
    0,
    0,
    147,
    0,
    0,
    0,
    148,
    0,
    0,
    0,
    252,
    255,
    255,
    255,
    252,
    255,
    255,
    255,
    32,
    67,
    0,
    0,
    149,
    0,
    0,
    0,
    150,
    0,
    0,
    0,
    4,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    104,
    67,
    0,
    0,
    151,
    0,
    0,
    0,
    152,
    0,
    0,
    0,
    252,
    255,
    255,
    255,
    252,
    255,
    255,
    255,
    104,
    67,
    0,
    0,
    153,
    0,
    0,
    0,
    154,
    0,
    0,
    0,
    105,
    111,
    115,
    116,
    114,
    101,
    97,
    109,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    117,
    110,
    115,
    112,
    101,
    99,
    105,
    102,
    105,
    101,
    100,
    32,
    105,
    111,
    115,
    116,
    114,
    101,
    97,
    109,
    95,
    99,
    97,
    116,
    101,
    103,
    111,
    114,
    121,
    32,
    101,
    114,
    114,
    111,
    114,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    48,
    65,
    0,
    0,
    155,
    0,
    0,
    0,
    156,
    0,
    0,
    0,
    7,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    88,
    65,
    0,
    0,
    157,
    0,
    0,
    0,
    158,
    0,
    0,
    0,
    105,
    111,
    115,
    95,
    98,
    97,
    115,
    101,
    58,
    58,
    99,
    108,
    101,
    97,
    114,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    56,
    105,
    111,
    115,
    95,
    98,
    97,
    115,
    101,
    55,
    102,
    97,
    105,
    108,
    117,
    114,
    101,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    16,
    65,
    0,
    0,
    136,
    61,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    56,
    105,
    111,
    115,
    95,
    98,
    97,
    115,
    101,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    160,
    109,
    0,
    0,
    64,
    65,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    57,
    98,
    97,
    115,
    105,
    99,
    95,
    105,
    111,
    115,
    73,
    99,
    78,
    83,
    95,
    49,
    49,
    99,
    104,
    97,
    114,
    95,
    116,
    114,
    97,
    105,
    116,
    115,
    73,
    99,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    96,
    65,
    0,
    0,
    88,
    65,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    57,
    98,
    97,
    115,
    105,
    99,
    95,
    105,
    111,
    115,
    73,
    119,
    78,
    83,
    95,
    49,
    49,
    99,
    104,
    97,
    114,
    95,
    116,
    114,
    97,
    105,
    116,
    115,
    73,
    119,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    160,
    65,
    0,
    0,
    88,
    65,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    53,
    98,
    97,
    115,
    105,
    99,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    98,
    117,
    102,
    73,
    99,
    78,
    83,
    95,
    49,
    49,
    99,
    104,
    97,
    114,
    95,
    116,
    114,
    97,
    105,
    116,
    115,
    73,
    99,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    160,
    109,
    0,
    0,
    224,
    65,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    53,
    98,
    97,
    115,
    105,
    99,
    95,
    115,
    116,
    114,
    101,
    97,
    109,
    98,
    117,
    102,
    73,
    119,
    78,
    83,
    95,
    49,
    49,
    99,
    104,
    97,
    114,
    95,
    116,
    114,
    97,
    105,
    116,
    115,
    73,
    119,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    160,
    109,
    0,
    0,
    32,
    66,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    51,
    98,
    97,
    115,
    105,
    99,
    95,
    105,
    115,
    116,
    114,
    101,
    97,
    109,
    73,
    99,
    78,
    83,
    95,
    49,
    49,
    99,
    104,
    97,
    114,
    95,
    116,
    114,
    97,
    105,
    116,
    115,
    73,
    99,
    69,
    69,
    69,
    69,
    0,
    0,
    104,
    111,
    0,
    0,
    96,
    66,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    144,
    65,
    0,
    0,
    3,
    244,
    255,
    255,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    51,
    98,
    97,
    115,
    105,
    99,
    95,
    105,
    115,
    116,
    114,
    101,
    97,
    109,
    73,
    119,
    78,
    83,
    95,
    49,
    49,
    99,
    104,
    97,
    114,
    95,
    116,
    114,
    97,
    105,
    116,
    115,
    73,
    119,
    69,
    69,
    69,
    69,
    0,
    0,
    104,
    111,
    0,
    0,
    168,
    66,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    208,
    65,
    0,
    0,
    3,
    244,
    255,
    255,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    51,
    98,
    97,
    115,
    105,
    99,
    95,
    111,
    115,
    116,
    114,
    101,
    97,
    109,
    73,
    99,
    78,
    83,
    95,
    49,
    49,
    99,
    104,
    97,
    114,
    95,
    116,
    114,
    97,
    105,
    116,
    115,
    73,
    99,
    69,
    69,
    69,
    69,
    0,
    0,
    104,
    111,
    0,
    0,
    240,
    66,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    144,
    65,
    0,
    0,
    3,
    244,
    255,
    255,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    51,
    98,
    97,
    115,
    105,
    99,
    95,
    111,
    115,
    116,
    114,
    101,
    97,
    109,
    73,
    119,
    78,
    83,
    95,
    49,
    49,
    99,
    104,
    97,
    114,
    95,
    116,
    114,
    97,
    105,
    116,
    115,
    73,
    119,
    69,
    69,
    69,
    69,
    0,
    0,
    104,
    111,
    0,
    0,
    56,
    67,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    208,
    65,
    0,
    0,
    3,
    244,
    255,
    255,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    52,
    98,
    97,
    115,
    105,
    99,
    95,
    105,
    111,
    115,
    116,
    114,
    101,
    97,
    109,
    73,
    99,
    78,
    83,
    95,
    49,
    49,
    99,
    104,
    97,
    114,
    95,
    116,
    114,
    97,
    105,
    116,
    115,
    73,
    99,
    69,
    69,
    69,
    69,
    0,
    104,
    111,
    0,
    0,
    128,
    67,
    0,
    0,
    3,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    144,
    66,
    0,
    0,
    2,
    0,
    0,
    0,
    32,
    67,
    0,
    0,
    2,
    8,
    0,
    0,
    0,
    0,
    0,
    0,
    24,
    68,
    0,
    0,
    159,
    0,
    0,
    0,
    160,
    0,
    0,
    0,
    28,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    9,
    0,
    0,
    0,
    10,
    0,
    0,
    0,
    5,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    57,
    95,
    95,
    105,
    111,
    115,
    116,
    114,
    101,
    97,
    109,
    95,
    99,
    97,
    116,
    101,
    103,
    111,
    114,
    121,
    69,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    248,
    67,
    0,
    0,
    216,
    61,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    40,
    82,
    0,
    0,
    161,
    0,
    0,
    0,
    162,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    4,
    0,
    0,
    0,
    11,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    80,
    82,
    0,
    0,
    164,
    0,
    0,
    0,
    165,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    5,
    0,
    0,
    0,
    12,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    87,
    0,
    0,
    166,
    0,
    0,
    0,
    167,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    3,
    0,
    0,
    0,
    4,
    0,
    0,
    0,
    5,
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    7,
    0,
    0,
    0,
    8,
    0,
    0,
    0,
    9,
    0,
    0,
    0,
    10,
    0,
    0,
    0,
    11,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    48,
    49,
    50,
    51,
    52,
    53,
    54,
    55,
    56,
    57,
    97,
    98,
    99,
    100,
    101,
    102,
    65,
    66,
    67,
    68,
    69,
    70,
    120,
    88,
    43,
    45,
    112,
    80,
    105,
    73,
    110,
    78,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    37,
    112,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    152,
    87,
    0,
    0,
    168,
    0,
    0,
    0,
    169,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    12,
    0,
    0,
    0,
    13,
    0,
    0,
    0,
    14,
    0,
    0,
    0,
    15,
    0,
    0,
    0,
    16,
    0,
    0,
    0,
    17,
    0,
    0,
    0,
    18,
    0,
    0,
    0,
    19,
    0,
    0,
    0,
    20,
    0,
    0,
    0,
    21,
    0,
    0,
    0,
    22,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    88,
    88,
    0,
    0,
    170,
    0,
    0,
    0,
    171,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    4,
    0,
    0,
    0,
    5,
    0,
    0,
    0,
    23,
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    24,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    7,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    108,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    108,
    108,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    76,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    240,
    88,
    0,
    0,
    172,
    0,
    0,
    0,
    173,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    8,
    0,
    0,
    0,
    9,
    0,
    0,
    0,
    25,
    0,
    0,
    0,
    10,
    0,
    0,
    0,
    26,
    0,
    0,
    0,
    3,
    0,
    0,
    0,
    4,
    0,
    0,
    0,
    11,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    37,
    112,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    24,
    84,
    0,
    0,
    174,
    0,
    0,
    0,
    175,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    29,
    0,
    0,
    0,
    27,
    0,
    0,
    0,
    28,
    0,
    0,
    0,
    29,
    0,
    0,
    0,
    30,
    0,
    0,
    0,
    31,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    248,
    255,
    255,
    255,
    24,
    84,
    0,
    0,
    30,
    0,
    0,
    0,
    31,
    0,
    0,
    0,
    32,
    0,
    0,
    0,
    33,
    0,
    0,
    0,
    34,
    0,
    0,
    0,
    35,
    0,
    0,
    0,
    36,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    37,
    72,
    58,
    37,
    77,
    58,
    37,
    83,
    37,
    109,
    47,
    37,
    100,
    47,
    37,
    121,
    37,
    89,
    45,
    37,
    109,
    45,
    37,
    100,
    37,
    73,
    58,
    37,
    77,
    58,
    37,
    83,
    32,
    37,
    112,
    0,
    0,
    0,
    0,
    0,
    37,
    72,
    58,
    37,
    77,
    0,
    0,
    0,
    37,
    72,
    58,
    37,
    77,
    58,
    37,
    83,
    0,
    0,
    0,
    0,
    184,
    84,
    0,
    0,
    176,
    0,
    0,
    0,
    177,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    32,
    0,
    0,
    0,
    33,
    0,
    0,
    0,
    34,
    0,
    0,
    0,
    35,
    0,
    0,
    0,
    36,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    248,
    255,
    255,
    255,
    184,
    84,
    0,
    0,
    38,
    0,
    0,
    0,
    39,
    0,
    0,
    0,
    40,
    0,
    0,
    0,
    41,
    0,
    0,
    0,
    42,
    0,
    0,
    0,
    43,
    0,
    0,
    0,
    44,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    72,
    0,
    0,
    0,
    58,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    77,
    0,
    0,
    0,
    58,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    83,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    109,
    0,
    0,
    0,
    47,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    100,
    0,
    0,
    0,
    47,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    121,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    89,
    0,
    0,
    0,
    45,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    109,
    0,
    0,
    0,
    45,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    100,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    73,
    0,
    0,
    0,
    58,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    77,
    0,
    0,
    0,
    58,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    83,
    0,
    0,
    0,
    32,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    112,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    72,
    0,
    0,
    0,
    58,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    77,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    72,
    0,
    0,
    0,
    58,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    77,
    0,
    0,
    0,
    58,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    83,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    72,
    85,
    0,
    0,
    178,
    0,
    0,
    0,
    179,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    176,
    85,
    0,
    0,
    180,
    0,
    0,
    0,
    181,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    160,
    82,
    0,
    0,
    182,
    0,
    0,
    0,
    183,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    45,
    0,
    0,
    0,
    46,
    0,
    0,
    0,
    21,
    0,
    0,
    0,
    22,
    0,
    0,
    0,
    23,
    0,
    0,
    0,
    24,
    0,
    0,
    0,
    47,
    0,
    0,
    0,
    25,
    0,
    0,
    0,
    26,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    224,
    82,
    0,
    0,
    184,
    0,
    0,
    0,
    185,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    48,
    0,
    0,
    0,
    49,
    0,
    0,
    0,
    27,
    0,
    0,
    0,
    28,
    0,
    0,
    0,
    29,
    0,
    0,
    0,
    30,
    0,
    0,
    0,
    50,
    0,
    0,
    0,
    31,
    0,
    0,
    0,
    32,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    32,
    83,
    0,
    0,
    186,
    0,
    0,
    0,
    187,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    51,
    0,
    0,
    0,
    52,
    0,
    0,
    0,
    33,
    0,
    0,
    0,
    34,
    0,
    0,
    0,
    35,
    0,
    0,
    0,
    36,
    0,
    0,
    0,
    53,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    38,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    96,
    83,
    0,
    0,
    188,
    0,
    0,
    0,
    189,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    54,
    0,
    0,
    0,
    55,
    0,
    0,
    0,
    39,
    0,
    0,
    0,
    40,
    0,
    0,
    0,
    41,
    0,
    0,
    0,
    42,
    0,
    0,
    0,
    56,
    0,
    0,
    0,
    43,
    0,
    0,
    0,
    44,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    128,
    89,
    0,
    0,
    190,
    0,
    0,
    0,
    191,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    3,
    0,
    0,
    0,
    4,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    48,
    49,
    50,
    51,
    52,
    53,
    54,
    55,
    56,
    57,
    0,
    0,
    0,
    0,
    0,
    0,
    37,
    76,
    102,
    0,
    0,
    0,
    0,
    0,
    109,
    111,
    110,
    101,
    121,
    95,
    103,
    101,
    116,
    32,
    101,
    114,
    114,
    111,
    114,
    0,
    0,
    0,
    0,
    0,
    16,
    90,
    0,
    0,
    192,
    0,
    0,
    0,
    193,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    5,
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    48,
    49,
    50,
    51,
    52,
    53,
    54,
    55,
    56,
    57,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    160,
    90,
    0,
    0,
    194,
    0,
    0,
    0,
    195,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    37,
    46,
    48,
    76,
    102,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    48,
    91,
    0,
    0,
    196,
    0,
    0,
    0,
    197,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    38,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    86,
    0,
    0,
    198,
    0,
    0,
    0,
    199,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    13,
    0,
    0,
    0,
    12,
    0,
    0,
    0,
    45,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    64,
    86,
    0,
    0,
    200,
    0,
    0,
    0,
    201,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    14,
    0,
    0,
    0,
    13,
    0,
    0,
    0,
    46,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    118,
    101,
    99,
    116,
    111,
    114,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    67,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    82,
    0,
    0,
    202,
    0,
    0,
    0,
    203,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    216,
    78,
    0,
    0,
    204,
    0,
    0,
    0,
    205,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    28,
    0,
    0,
    0,
    15,
    0,
    0,
    0,
    29,
    0,
    0,
    0,
    16,
    0,
    0,
    0,
    30,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    17,
    0,
    0,
    0,
    3,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    184,
    79,
    0,
    0,
    206,
    0,
    0,
    0,
    207,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    4,
    0,
    0,
    0,
    57,
    0,
    0,
    0,
    58,
    0,
    0,
    0,
    5,
    0,
    0,
    0,
    59,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    176,
    81,
    0,
    0,
    208,
    0,
    0,
    0,
    209,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    60,
    0,
    0,
    0,
    61,
    0,
    0,
    0,
    47,
    0,
    0,
    0,
    48,
    0,
    0,
    0,
    49,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    216,
    81,
    0,
    0,
    210,
    0,
    0,
    0,
    211,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    62,
    0,
    0,
    0,
    63,
    0,
    0,
    0,
    50,
    0,
    0,
    0,
    51,
    0,
    0,
    0,
    52,
    0,
    0,
    0,
    116,
    0,
    0,
    0,
    114,
    0,
    0,
    0,
    117,
    0,
    0,
    0,
    101,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    102,
    97,
    108,
    115,
    101,
    0,
    0,
    0,
    102,
    0,
    0,
    0,
    97,
    0,
    0,
    0,
    108,
    0,
    0,
    0,
    115,
    0,
    0,
    0,
    101,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    109,
    0,
    0,
    0,
    47,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    100,
    0,
    0,
    0,
    47,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    121,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    72,
    0,
    0,
    0,
    58,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    77,
    0,
    0,
    0,
    58,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    83,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    37,
    97,
    32,
    37,
    98,
    32,
    37,
    100,
    32,
    37,
    72,
    58,
    37,
    77,
    58,
    37,
    83,
    32,
    37,
    89,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    97,
    0,
    0,
    0,
    32,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    98,
    0,
    0,
    0,
    32,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    100,
    0,
    0,
    0,
    32,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    72,
    0,
    0,
    0,
    58,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    77,
    0,
    0,
    0,
    58,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    83,
    0,
    0,
    0,
    32,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    89,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    37,
    73,
    58,
    37,
    77,
    58,
    37,
    83,
    32,
    37,
    112,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    73,
    0,
    0,
    0,
    58,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    77,
    0,
    0,
    0,
    58,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    83,
    0,
    0,
    0,
    32,
    0,
    0,
    0,
    37,
    0,
    0,
    0,
    112,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    108,
    111,
    99,
    97,
    108,
    101,
    32,
    110,
    111,
    116,
    32,
    115,
    117,
    112,
    112,
    111,
    114,
    116,
    101,
    100,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    16,
    78,
    0,
    0,
    212,
    0,
    0,
    0,
    213,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    54,
    108,
    111,
    99,
    97,
    108,
    101,
    53,
    102,
    97,
    99,
    101,
    116,
    69,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    248,
    77,
    0,
    0,
    144,
    60,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    160,
    78,
    0,
    0,
    212,
    0,
    0,
    0,
    214,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    18,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    3,
    0,
    0,
    0,
    4,
    0,
    0,
    0,
    31,
    0,
    0,
    0,
    19,
    0,
    0,
    0,
    32,
    0,
    0,
    0,
    20,
    0,
    0,
    0,
    33,
    0,
    0,
    0,
    5,
    0,
    0,
    0,
    21,
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    53,
    99,
    116,
    121,
    112,
    101,
    73,
    119,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    48,
    99,
    116,
    121,
    112,
    101,
    95,
    98,
    97,
    115,
    101,
    69,
    0,
    0,
    0,
    0,
    160,
    109,
    0,
    0,
    128,
    78,
    0,
    0,
    104,
    111,
    0,
    0,
    104,
    78,
    0,
    0,
    0,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    16,
    78,
    0,
    0,
    2,
    0,
    0,
    0,
    152,
    78,
    0,
    0,
    2,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    53,
    99,
    116,
    121,
    112,
    101,
    73,
    99,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    104,
    111,
    0,
    0,
    192,
    78,
    0,
    0,
    0,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    16,
    78,
    0,
    0,
    2,
    0,
    0,
    0,
    152,
    78,
    0,
    0,
    2,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    112,
    79,
    0,
    0,
    212,
    0,
    0,
    0,
    215,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    3,
    0,
    0,
    0,
    4,
    0,
    0,
    0,
    7,
    0,
    0,
    0,
    64,
    0,
    0,
    0,
    65,
    0,
    0,
    0,
    8,
    0,
    0,
    0,
    66,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    55,
    99,
    111,
    100,
    101,
    99,
    118,
    116,
    73,
    99,
    99,
    49,
    49,
    95,
    95,
    109,
    98,
    115,
    116,
    97,
    116,
    101,
    95,
    116,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    50,
    99,
    111,
    100,
    101,
    99,
    118,
    116,
    95,
    98,
    97,
    115,
    101,
    69,
    0,
    0,
    160,
    109,
    0,
    0,
    80,
    79,
    0,
    0,
    104,
    111,
    0,
    0,
    40,
    79,
    0,
    0,
    0,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    16,
    78,
    0,
    0,
    2,
    0,
    0,
    0,
    104,
    79,
    0,
    0,
    2,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    55,
    99,
    111,
    100,
    101,
    99,
    118,
    116,
    73,
    119,
    99,
    49,
    49,
    95,
    95,
    109,
    98,
    115,
    116,
    97,
    116,
    101,
    95,
    116,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    104,
    111,
    0,
    0,
    144,
    79,
    0,
    0,
    0,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    16,
    78,
    0,
    0,
    2,
    0,
    0,
    0,
    104,
    79,
    0,
    0,
    2,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    48,
    80,
    0,
    0,
    212,
    0,
    0,
    0,
    216,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    5,
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    9,
    0,
    0,
    0,
    67,
    0,
    0,
    0,
    68,
    0,
    0,
    0,
    10,
    0,
    0,
    0,
    69,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    55,
    99,
    111,
    100,
    101,
    99,
    118,
    116,
    73,
    68,
    115,
    99,
    49,
    49,
    95,
    95,
    109,
    98,
    115,
    116,
    97,
    116,
    101,
    95,
    116,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    104,
    111,
    0,
    0,
    8,
    80,
    0,
    0,
    0,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    16,
    78,
    0,
    0,
    2,
    0,
    0,
    0,
    104,
    79,
    0,
    0,
    2,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    168,
    80,
    0,
    0,
    212,
    0,
    0,
    0,
    217,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    7,
    0,
    0,
    0,
    8,
    0,
    0,
    0,
    11,
    0,
    0,
    0,
    70,
    0,
    0,
    0,
    71,
    0,
    0,
    0,
    12,
    0,
    0,
    0,
    72,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    55,
    99,
    111,
    100,
    101,
    99,
    118,
    116,
    73,
    68,
    105,
    99,
    49,
    49,
    95,
    95,
    109,
    98,
    115,
    116,
    97,
    116,
    101,
    95,
    116,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    104,
    111,
    0,
    0,
    128,
    80,
    0,
    0,
    0,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    16,
    78,
    0,
    0,
    2,
    0,
    0,
    0,
    104,
    79,
    0,
    0,
    2,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    32,
    81,
    0,
    0,
    212,
    0,
    0,
    0,
    218,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    7,
    0,
    0,
    0,
    8,
    0,
    0,
    0,
    11,
    0,
    0,
    0,
    70,
    0,
    0,
    0,
    71,
    0,
    0,
    0,
    12,
    0,
    0,
    0,
    72,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    54,
    95,
    95,
    110,
    97,
    114,
    114,
    111,
    119,
    95,
    116,
    111,
    95,
    117,
    116,
    102,
    56,
    73,
    76,
    106,
    51,
    50,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    248,
    80,
    0,
    0,
    168,
    80,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    136,
    81,
    0,
    0,
    212,
    0,
    0,
    0,
    219,
    0,
    0,
    0,
    163,
    0,
    0,
    0,
    7,
    0,
    0,
    0,
    8,
    0,
    0,
    0,
    11,
    0,
    0,
    0,
    70,
    0,
    0,
    0,
    71,
    0,
    0,
    0,
    12,
    0,
    0,
    0,
    72,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    55,
    95,
    95,
    119,
    105,
    100,
    101,
    110,
    95,
    102,
    114,
    111,
    109,
    95,
    117,
    116,
    102,
    56,
    73,
    76,
    106,
    51,
    50,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    96,
    81,
    0,
    0,
    168,
    80,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    56,
    110,
    117,
    109,
    112,
    117,
    110,
    99,
    116,
    73,
    99,
    69,
    69,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    152,
    81,
    0,
    0,
    16,
    78,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    56,
    110,
    117,
    109,
    112,
    117,
    110,
    99,
    116,
    73,
    119,
    69,
    69,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    192,
    81,
    0,
    0,
    16,
    78,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    54,
    108,
    111,
    99,
    97,
    108,
    101,
    53,
    95,
    95,
    105,
    109,
    112,
    69,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    232,
    81,
    0,
    0,
    16,
    78,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    55,
    99,
    111,
    108,
    108,
    97,
    116,
    101,
    73,
    99,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    16,
    82,
    0,
    0,
    16,
    78,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    55,
    99,
    111,
    108,
    108,
    97,
    116,
    101,
    73,
    119,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    56,
    82,
    0,
    0,
    16,
    78,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    48,
    109,
    111,
    110,
    101,
    121,
    112,
    117,
    110,
    99,
    116,
    73,
    99,
    76,
    98,
    48,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    48,
    109,
    111,
    110,
    101,
    121,
    95,
    98,
    97,
    115,
    101,
    69,
    0,
    0,
    0,
    0,
    160,
    109,
    0,
    0,
    128,
    82,
    0,
    0,
    104,
    111,
    0,
    0,
    96,
    82,
    0,
    0,
    0,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    16,
    78,
    0,
    0,
    2,
    0,
    0,
    0,
    152,
    82,
    0,
    0,
    2,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    48,
    109,
    111,
    110,
    101,
    121,
    112,
    117,
    110,
    99,
    116,
    73,
    99,
    76,
    98,
    49,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    104,
    111,
    0,
    0,
    192,
    82,
    0,
    0,
    0,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    16,
    78,
    0,
    0,
    2,
    0,
    0,
    0,
    152,
    82,
    0,
    0,
    2,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    48,
    109,
    111,
    110,
    101,
    121,
    112,
    117,
    110,
    99,
    116,
    73,
    119,
    76,
    98,
    48,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    104,
    111,
    0,
    0,
    0,
    83,
    0,
    0,
    0,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    16,
    78,
    0,
    0,
    2,
    0,
    0,
    0,
    152,
    82,
    0,
    0,
    2,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    48,
    109,
    111,
    110,
    101,
    121,
    112,
    117,
    110,
    99,
    116,
    73,
    119,
    76,
    98,
    49,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    104,
    111,
    0,
    0,
    64,
    83,
    0,
    0,
    0,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    16,
    78,
    0,
    0,
    2,
    0,
    0,
    0,
    152,
    82,
    0,
    0,
    2,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    56,
    116,
    105,
    109,
    101,
    95,
    103,
    101,
    116,
    73,
    99,
    78,
    83,
    95,
    49,
    57,
    105,
    115,
    116,
    114,
    101,
    97,
    109,
    98,
    117,
    102,
    95,
    105,
    116,
    101,
    114,
    97,
    116,
    111,
    114,
    73,
    99,
    78,
    83,
    95,
    49,
    49,
    99,
    104,
    97,
    114,
    95,
    116,
    114,
    97,
    105,
    116,
    115,
    73,
    99,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    57,
    116,
    105,
    109,
    101,
    95,
    98,
    97,
    115,
    101,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    160,
    109,
    0,
    0,
    200,
    83,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    50,
    48,
    95,
    95,
    116,
    105,
    109,
    101,
    95,
    103,
    101,
    116,
    95,
    99,
    95,
    115,
    116,
    111,
    114,
    97,
    103,
    101,
    73,
    99,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    160,
    109,
    0,
    0,
    232,
    83,
    0,
    0,
    104,
    111,
    0,
    0,
    128,
    83,
    0,
    0,
    0,
    0,
    0,
    0,
    3,
    0,
    0,
    0,
    16,
    78,
    0,
    0,
    2,
    0,
    0,
    0,
    224,
    83,
    0,
    0,
    2,
    0,
    0,
    0,
    16,
    84,
    0,
    0,
    0,
    8,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    56,
    116,
    105,
    109,
    101,
    95,
    103,
    101,
    116,
    73,
    119,
    78,
    83,
    95,
    49,
    57,
    105,
    115,
    116,
    114,
    101,
    97,
    109,
    98,
    117,
    102,
    95,
    105,
    116,
    101,
    114,
    97,
    116,
    111,
    114,
    73,
    119,
    78,
    83,
    95,
    49,
    49,
    99,
    104,
    97,
    114,
    95,
    116,
    114,
    97,
    105,
    116,
    115,
    73,
    119,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    50,
    48,
    95,
    95,
    116,
    105,
    109,
    101,
    95,
    103,
    101,
    116,
    95,
    99,
    95,
    115,
    116,
    111,
    114,
    97,
    103,
    101,
    73,
    119,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    160,
    109,
    0,
    0,
    136,
    84,
    0,
    0,
    104,
    111,
    0,
    0,
    64,
    84,
    0,
    0,
    0,
    0,
    0,
    0,
    3,
    0,
    0,
    0,
    16,
    78,
    0,
    0,
    2,
    0,
    0,
    0,
    224,
    83,
    0,
    0,
    2,
    0,
    0,
    0,
    176,
    84,
    0,
    0,
    0,
    8,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    56,
    116,
    105,
    109,
    101,
    95,
    112,
    117,
    116,
    73,
    99,
    78,
    83,
    95,
    49,
    57,
    111,
    115,
    116,
    114,
    101,
    97,
    109,
    98,
    117,
    102,
    95,
    105,
    116,
    101,
    114,
    97,
    116,
    111,
    114,
    73,
    99,
    78,
    83,
    95,
    49,
    49,
    99,
    104,
    97,
    114,
    95,
    116,
    114,
    97,
    105,
    116,
    115,
    73,
    99,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    48,
    95,
    95,
    116,
    105,
    109,
    101,
    95,
    112,
    117,
    116,
    69,
    0,
    0,
    0,
    0,
    160,
    109,
    0,
    0,
    40,
    85,
    0,
    0,
    104,
    111,
    0,
    0,
    224,
    84,
    0,
    0,
    0,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    16,
    78,
    0,
    0,
    2,
    0,
    0,
    0,
    64,
    85,
    0,
    0,
    0,
    8,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    56,
    116,
    105,
    109,
    101,
    95,
    112,
    117,
    116,
    73,
    119,
    78,
    83,
    95,
    49,
    57,
    111,
    115,
    116,
    114,
    101,
    97,
    109,
    98,
    117,
    102,
    95,
    105,
    116,
    101,
    114,
    97,
    116,
    111,
    114,
    73,
    119,
    78,
    83,
    95,
    49,
    49,
    99,
    104,
    97,
    114,
    95,
    116,
    114,
    97,
    105,
    116,
    115,
    73,
    119,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    104,
    111,
    0,
    0,
    104,
    85,
    0,
    0,
    0,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    16,
    78,
    0,
    0,
    2,
    0,
    0,
    0,
    64,
    85,
    0,
    0,
    0,
    8,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    56,
    109,
    101,
    115,
    115,
    97,
    103,
    101,
    115,
    73,
    99,
    69,
    69,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    51,
    109,
    101,
    115,
    115,
    97,
    103,
    101,
    115,
    95,
    98,
    97,
    115,
    101,
    69,
    0,
    160,
    109,
    0,
    0,
    232,
    85,
    0,
    0,
    104,
    111,
    0,
    0,
    208,
    85,
    0,
    0,
    0,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    16,
    78,
    0,
    0,
    2,
    0,
    0,
    0,
    0,
    86,
    0,
    0,
    2,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    56,
    109,
    101,
    115,
    115,
    97,
    103,
    101,
    115,
    73,
    119,
    69,
    69,
    0,
    0,
    0,
    0,
    104,
    111,
    0,
    0,
    40,
    86,
    0,
    0,
    0,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    16,
    78,
    0,
    0,
    2,
    0,
    0,
    0,
    0,
    86,
    0,
    0,
    2,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    55,
    110,
    117,
    109,
    95,
    103,
    101,
    116,
    73,
    99,
    78,
    83,
    95,
    49,
    57,
    105,
    115,
    116,
    114,
    101,
    97,
    109,
    98,
    117,
    102,
    95,
    105,
    116,
    101,
    114,
    97,
    116,
    111,
    114,
    73,
    99,
    78,
    83,
    95,
    49,
    49,
    99,
    104,
    97,
    114,
    95,
    116,
    114,
    97,
    105,
    116,
    115,
    73,
    99,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    57,
    95,
    95,
    110,
    117,
    109,
    95,
    103,
    101,
    116,
    73,
    99,
    69,
    69,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    52,
    95,
    95,
    110,
    117,
    109,
    95,
    103,
    101,
    116,
    95,
    98,
    97,
    115,
    101,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    160,
    109,
    0,
    0,
    192,
    86,
    0,
    0,
    104,
    111,
    0,
    0,
    168,
    86,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    224,
    86,
    0,
    0,
    0,
    0,
    0,
    0,
    104,
    111,
    0,
    0,
    96,
    86,
    0,
    0,
    0,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    16,
    78,
    0,
    0,
    2,
    0,
    0,
    0,
    232,
    86,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    55,
    110,
    117,
    109,
    95,
    103,
    101,
    116,
    73,
    119,
    78,
    83,
    95,
    49,
    57,
    105,
    115,
    116,
    114,
    101,
    97,
    109,
    98,
    117,
    102,
    95,
    105,
    116,
    101,
    114,
    97,
    116,
    111,
    114,
    73,
    119,
    78,
    83,
    95,
    49,
    49,
    99,
    104,
    97,
    114,
    95,
    116,
    114,
    97,
    105,
    116,
    115,
    73,
    119,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    57,
    95,
    95,
    110,
    117,
    109,
    95,
    103,
    101,
    116,
    73,
    119,
    69,
    69,
    0,
    0,
    0,
    104,
    111,
    0,
    0,
    104,
    87,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    224,
    86,
    0,
    0,
    0,
    0,
    0,
    0,
    104,
    111,
    0,
    0,
    32,
    87,
    0,
    0,
    0,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    16,
    78,
    0,
    0,
    2,
    0,
    0,
    0,
    128,
    87,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    55,
    110,
    117,
    109,
    95,
    112,
    117,
    116,
    73,
    99,
    78,
    83,
    95,
    49,
    57,
    111,
    115,
    116,
    114,
    101,
    97,
    109,
    98,
    117,
    102,
    95,
    105,
    116,
    101,
    114,
    97,
    116,
    111,
    114,
    73,
    99,
    78,
    83,
    95,
    49,
    49,
    99,
    104,
    97,
    114,
    95,
    116,
    114,
    97,
    105,
    116,
    115,
    73,
    99,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    57,
    95,
    95,
    110,
    117,
    109,
    95,
    112,
    117,
    116,
    73,
    99,
    69,
    69,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    52,
    95,
    95,
    110,
    117,
    109,
    95,
    112,
    117,
    116,
    95,
    98,
    97,
    115,
    101,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    160,
    109,
    0,
    0,
    24,
    88,
    0,
    0,
    104,
    111,
    0,
    0,
    0,
    88,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    56,
    88,
    0,
    0,
    0,
    0,
    0,
    0,
    104,
    111,
    0,
    0,
    184,
    87,
    0,
    0,
    0,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    16,
    78,
    0,
    0,
    2,
    0,
    0,
    0,
    64,
    88,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    55,
    110,
    117,
    109,
    95,
    112,
    117,
    116,
    73,
    119,
    78,
    83,
    95,
    49,
    57,
    111,
    115,
    116,
    114,
    101,
    97,
    109,
    98,
    117,
    102,
    95,
    105,
    116,
    101,
    114,
    97,
    116,
    111,
    114,
    73,
    119,
    78,
    83,
    95,
    49,
    49,
    99,
    104,
    97,
    114,
    95,
    116,
    114,
    97,
    105,
    116,
    115,
    73,
    119,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    57,
    95,
    95,
    110,
    117,
    109,
    95,
    112,
    117,
    116,
    73,
    119,
    69,
    69,
    0,
    0,
    0,
    104,
    111,
    0,
    0,
    192,
    88,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    56,
    88,
    0,
    0,
    0,
    0,
    0,
    0,
    104,
    111,
    0,
    0,
    120,
    88,
    0,
    0,
    0,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    16,
    78,
    0,
    0,
    2,
    0,
    0,
    0,
    216,
    88,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    57,
    109,
    111,
    110,
    101,
    121,
    95,
    103,
    101,
    116,
    73,
    99,
    78,
    83,
    95,
    49,
    57,
    105,
    115,
    116,
    114,
    101,
    97,
    109,
    98,
    117,
    102,
    95,
    105,
    116,
    101,
    114,
    97,
    116,
    111,
    114,
    73,
    99,
    78,
    83,
    95,
    49,
    49,
    99,
    104,
    97,
    114,
    95,
    116,
    114,
    97,
    105,
    116,
    115,
    73,
    99,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    49,
    95,
    95,
    109,
    111,
    110,
    101,
    121,
    95,
    103,
    101,
    116,
    73,
    99,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    160,
    109,
    0,
    0,
    88,
    89,
    0,
    0,
    104,
    111,
    0,
    0,
    16,
    89,
    0,
    0,
    0,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    16,
    78,
    0,
    0,
    2,
    0,
    0,
    0,
    120,
    89,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    57,
    109,
    111,
    110,
    101,
    121,
    95,
    103,
    101,
    116,
    73,
    119,
    78,
    83,
    95,
    49,
    57,
    105,
    115,
    116,
    114,
    101,
    97,
    109,
    98,
    117,
    102,
    95,
    105,
    116,
    101,
    114,
    97,
    116,
    111,
    114,
    73,
    119,
    78,
    83,
    95,
    49,
    49,
    99,
    104,
    97,
    114,
    95,
    116,
    114,
    97,
    105,
    116,
    115,
    73,
    119,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    49,
    95,
    95,
    109,
    111,
    110,
    101,
    121,
    95,
    103,
    101,
    116,
    73,
    119,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    160,
    109,
    0,
    0,
    232,
    89,
    0,
    0,
    104,
    111,
    0,
    0,
    160,
    89,
    0,
    0,
    0,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    16,
    78,
    0,
    0,
    2,
    0,
    0,
    0,
    8,
    90,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    57,
    109,
    111,
    110,
    101,
    121,
    95,
    112,
    117,
    116,
    73,
    99,
    78,
    83,
    95,
    49,
    57,
    111,
    115,
    116,
    114,
    101,
    97,
    109,
    98,
    117,
    102,
    95,
    105,
    116,
    101,
    114,
    97,
    116,
    111,
    114,
    73,
    99,
    78,
    83,
    95,
    49,
    49,
    99,
    104,
    97,
    114,
    95,
    116,
    114,
    97,
    105,
    116,
    115,
    73,
    99,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    49,
    95,
    95,
    109,
    111,
    110,
    101,
    121,
    95,
    112,
    117,
    116,
    73,
    99,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    160,
    109,
    0,
    0,
    120,
    90,
    0,
    0,
    104,
    111,
    0,
    0,
    48,
    90,
    0,
    0,
    0,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    16,
    78,
    0,
    0,
    2,
    0,
    0,
    0,
    152,
    90,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    57,
    109,
    111,
    110,
    101,
    121,
    95,
    112,
    117,
    116,
    73,
    119,
    78,
    83,
    95,
    49,
    57,
    111,
    115,
    116,
    114,
    101,
    97,
    109,
    98,
    117,
    102,
    95,
    105,
    116,
    101,
    114,
    97,
    116,
    111,
    114,
    73,
    119,
    78,
    83,
    95,
    49,
    49,
    99,
    104,
    97,
    114,
    95,
    116,
    114,
    97,
    105,
    116,
    115,
    73,
    119,
    69,
    69,
    69,
    69,
    69,
    69,
    0,
    0,
    0,
    78,
    83,
    116,
    51,
    95,
    95,
    49,
    49,
    49,
    95,
    95,
    109,
    111,
    110,
    101,
    121,
    95,
    112,
    117,
    116,
    73,
    119,
    69,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    160,
    109,
    0,
    0,
    8,
    91,
    0,
    0,
    104,
    111,
    0,
    0,
    192,
    90,
    0,
    0,
    0,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    16,
    78,
    0,
    0,
    2,
    0,
    0,
    0,
    40,
    91,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    65,
    0,
    0,
    0,
    77,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    80,
    0,
    0,
    0,
    77,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    65,
    77,
    0,
    0,
    0,
    0,
    0,
    0,
    80,
    77,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    74,
    0,
    0,
    0,
    97,
    0,
    0,
    0,
    110,
    0,
    0,
    0,
    117,
    0,
    0,
    0,
    97,
    0,
    0,
    0,
    114,
    0,
    0,
    0,
    121,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    70,
    0,
    0,
    0,
    101,
    0,
    0,
    0,
    98,
    0,
    0,
    0,
    114,
    0,
    0,
    0,
    117,
    0,
    0,
    0,
    97,
    0,
    0,
    0,
    114,
    0,
    0,
    0,
    121,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    77,
    0,
    0,
    0,
    97,
    0,
    0,
    0,
    114,
    0,
    0,
    0,
    99,
    0,
    0,
    0,
    104,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    65,
    0,
    0,
    0,
    112,
    0,
    0,
    0,
    114,
    0,
    0,
    0,
    105,
    0,
    0,
    0,
    108,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    74,
    0,
    0,
    0,
    117,
    0,
    0,
    0,
    110,
    0,
    0,
    0,
    101,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    74,
    0,
    0,
    0,
    117,
    0,
    0,
    0,
    108,
    0,
    0,
    0,
    121,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    65,
    0,
    0,
    0,
    117,
    0,
    0,
    0,
    103,
    0,
    0,
    0,
    117,
    0,
    0,
    0,
    115,
    0,
    0,
    0,
    116,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    83,
    0,
    0,
    0,
    101,
    0,
    0,
    0,
    112,
    0,
    0,
    0,
    116,
    0,
    0,
    0,
    101,
    0,
    0,
    0,
    109,
    0,
    0,
    0,
    98,
    0,
    0,
    0,
    101,
    0,
    0,
    0,
    114,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    79,
    0,
    0,
    0,
    99,
    0,
    0,
    0,
    116,
    0,
    0,
    0,
    111,
    0,
    0,
    0,
    98,
    0,
    0,
    0,
    101,
    0,
    0,
    0,
    114,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    0,
    0,
    0,
    111,
    0,
    0,
    0,
    118,
    0,
    0,
    0,
    101,
    0,
    0,
    0,
    109,
    0,
    0,
    0,
    98,
    0,
    0,
    0,
    101,
    0,
    0,
    0,
    114,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    68,
    0,
    0,
    0,
    101,
    0,
    0,
    0,
    99,
    0,
    0,
    0,
    101,
    0,
    0,
    0,
    109,
    0,
    0,
    0,
    98,
    0,
    0,
    0,
    101,
    0,
    0,
    0,
    114,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    74,
    0,
    0,
    0,
    97,
    0,
    0,
    0,
    110,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    70,
    0,
    0,
    0,
    101,
    0,
    0,
    0,
    98,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    77,
    0,
    0,
    0,
    97,
    0,
    0,
    0,
    114,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    65,
    0,
    0,
    0,
    112,
    0,
    0,
    0,
    114,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    77,
    0,
    0,
    0,
    97,
    0,
    0,
    0,
    121,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    74,
    0,
    0,
    0,
    117,
    0,
    0,
    0,
    110,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    74,
    0,
    0,
    0,
    117,
    0,
    0,
    0,
    108
  ],
  'i8',
  ALLOC_NONE,
  Runtime.GLOBAL_BASE + 14996
);
allocate(
  [
    65,
    0,
    0,
    0,
    117,
    0,
    0,
    0,
    103,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    83,
    0,
    0,
    0,
    101,
    0,
    0,
    0,
    112,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    79,
    0,
    0,
    0,
    99,
    0,
    0,
    0,
    116,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    0,
    0,
    0,
    111,
    0,
    0,
    0,
    118,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    68,
    0,
    0,
    0,
    101,
    0,
    0,
    0,
    99,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    74,
    97,
    110,
    117,
    97,
    114,
    121,
    0,
    70,
    101,
    98,
    114,
    117,
    97,
    114,
    121,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    77,
    97,
    114,
    99,
    104,
    0,
    0,
    0,
    65,
    112,
    114,
    105,
    108,
    0,
    0,
    0,
    77,
    97,
    121,
    0,
    0,
    0,
    0,
    0,
    74,
    117,
    110,
    101,
    0,
    0,
    0,
    0,
    74,
    117,
    108,
    121,
    0,
    0,
    0,
    0,
    65,
    117,
    103,
    117,
    115,
    116,
    0,
    0,
    83,
    101,
    112,
    116,
    101,
    109,
    98,
    101,
    114,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    79,
    99,
    116,
    111,
    98,
    101,
    114,
    0,
    78,
    111,
    118,
    101,
    109,
    98,
    101,
    114,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    68,
    101,
    99,
    101,
    109,
    98,
    101,
    114,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    74,
    97,
    110,
    0,
    0,
    0,
    0,
    0,
    70,
    101,
    98,
    0,
    0,
    0,
    0,
    0,
    77,
    97,
    114,
    0,
    0,
    0,
    0,
    0,
    65,
    112,
    114,
    0,
    0,
    0,
    0,
    0,
    74,
    117,
    110,
    0,
    0,
    0,
    0,
    0,
    74,
    117,
    108,
    0,
    0,
    0,
    0,
    0,
    65,
    117,
    103,
    0,
    0,
    0,
    0,
    0,
    83,
    101,
    112,
    0,
    0,
    0,
    0,
    0,
    79,
    99,
    116,
    0,
    0,
    0,
    0,
    0,
    78,
    111,
    118,
    0,
    0,
    0,
    0,
    0,
    68,
    101,
    99,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    83,
    0,
    0,
    0,
    117,
    0,
    0,
    0,
    110,
    0,
    0,
    0,
    100,
    0,
    0,
    0,
    97,
    0,
    0,
    0,
    121,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    77,
    0,
    0,
    0,
    111,
    0,
    0,
    0,
    110,
    0,
    0,
    0,
    100,
    0,
    0,
    0,
    97,
    0,
    0,
    0,
    121,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    84,
    0,
    0,
    0,
    117,
    0,
    0,
    0,
    101,
    0,
    0,
    0,
    115,
    0,
    0,
    0,
    100,
    0,
    0,
    0,
    97,
    0,
    0,
    0,
    121,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    87,
    0,
    0,
    0,
    101,
    0,
    0,
    0,
    100,
    0,
    0,
    0,
    110,
    0,
    0,
    0,
    101,
    0,
    0,
    0,
    115,
    0,
    0,
    0,
    100,
    0,
    0,
    0,
    97,
    0,
    0,
    0,
    121,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    84,
    0,
    0,
    0,
    104,
    0,
    0,
    0,
    117,
    0,
    0,
    0,
    114,
    0,
    0,
    0,
    115,
    0,
    0,
    0,
    100,
    0,
    0,
    0,
    97,
    0,
    0,
    0,
    121,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    70,
    0,
    0,
    0,
    114,
    0,
    0,
    0,
    105,
    0,
    0,
    0,
    100,
    0,
    0,
    0,
    97,
    0,
    0,
    0,
    121,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    83,
    0,
    0,
    0,
    97,
    0,
    0,
    0,
    116,
    0,
    0,
    0,
    117,
    0,
    0,
    0,
    114,
    0,
    0,
    0,
    100,
    0,
    0,
    0,
    97,
    0,
    0,
    0,
    121,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    83,
    0,
    0,
    0,
    117,
    0,
    0,
    0,
    110,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    77,
    0,
    0,
    0,
    111,
    0,
    0,
    0,
    110,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    84,
    0,
    0,
    0,
    117,
    0,
    0,
    0,
    101,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    87,
    0,
    0,
    0,
    101,
    0,
    0,
    0,
    100,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    84,
    0,
    0,
    0,
    104,
    0,
    0,
    0,
    117,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    70,
    0,
    0,
    0,
    114,
    0,
    0,
    0,
    105,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    83,
    0,
    0,
    0,
    97,
    0,
    0,
    0,
    116,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    83,
    117,
    110,
    100,
    97,
    121,
    0,
    0,
    77,
    111,
    110,
    100,
    97,
    121,
    0,
    0,
    84,
    117,
    101,
    115,
    100,
    97,
    121,
    0,
    87,
    101,
    100,
    110,
    101,
    115,
    100,
    97,
    121,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    84,
    104,
    117,
    114,
    115,
    100,
    97,
    121,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    70,
    114,
    105,
    100,
    97,
    121,
    0,
    0,
    83,
    97,
    116,
    117,
    114,
    100,
    97,
    121,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    83,
    117,
    110,
    0,
    0,
    0,
    0,
    0,
    77,
    111,
    110,
    0,
    0,
    0,
    0,
    0,
    84,
    117,
    101,
    0,
    0,
    0,
    0,
    0,
    87,
    101,
    100,
    0,
    0,
    0,
    0,
    0,
    84,
    104,
    117,
    0,
    0,
    0,
    0,
    0,
    70,
    114,
    105,
    0,
    0,
    0,
    0,
    0,
    83,
    97,
    116,
    0,
    0,
    0,
    0,
    0,
    2,
    0,
    0,
    192,
    3,
    0,
    0,
    192,
    4,
    0,
    0,
    192,
    5,
    0,
    0,
    192,
    6,
    0,
    0,
    192,
    7,
    0,
    0,
    192,
    8,
    0,
    0,
    192,
    9,
    0,
    0,
    192,
    10,
    0,
    0,
    192,
    11,
    0,
    0,
    192,
    12,
    0,
    0,
    192,
    13,
    0,
    0,
    192,
    14,
    0,
    0,
    192,
    15,
    0,
    0,
    192,
    16,
    0,
    0,
    192,
    17,
    0,
    0,
    192,
    18,
    0,
    0,
    192,
    19,
    0,
    0,
    192,
    20,
    0,
    0,
    192,
    21,
    0,
    0,
    192,
    22,
    0,
    0,
    192,
    23,
    0,
    0,
    192,
    24,
    0,
    0,
    192,
    25,
    0,
    0,
    192,
    26,
    0,
    0,
    192,
    27,
    0,
    0,
    192,
    28,
    0,
    0,
    192,
    29,
    0,
    0,
    192,
    30,
    0,
    0,
    192,
    31,
    0,
    0,
    192,
    0,
    0,
    0,
    179,
    1,
    0,
    0,
    195,
    2,
    0,
    0,
    195,
    3,
    0,
    0,
    195,
    4,
    0,
    0,
    195,
    5,
    0,
    0,
    195,
    6,
    0,
    0,
    195,
    7,
    0,
    0,
    195,
    8,
    0,
    0,
    195,
    9,
    0,
    0,
    195,
    10,
    0,
    0,
    195,
    11,
    0,
    0,
    195,
    12,
    0,
    0,
    195,
    13,
    0,
    0,
    211,
    14,
    0,
    0,
    195,
    15,
    0,
    0,
    195,
    0,
    0,
    12,
    187,
    1,
    0,
    12,
    195,
    2,
    0,
    12,
    195,
    3,
    0,
    12,
    195,
    4,
    0,
    12,
    211,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    117,
    110,
    99,
    97,
    117,
    103,
    104,
    116,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    116,
    101,
    114,
    109,
    105,
    110,
    97,
    116,
    105,
    110,
    103,
    32,
    119,
    105,
    116,
    104,
    32,
    37,
    115,
    32,
    101,
    120,
    99,
    101,
    112,
    116,
    105,
    111,
    110,
    32,
    111,
    102,
    32,
    116,
    121,
    112,
    101,
    32,
    37,
    115,
    58,
    32,
    37,
    115,
    0,
    0,
    0,
    0,
    116,
    101,
    114,
    109,
    105,
    110,
    97,
    116,
    105,
    110,
    103,
    32,
    119,
    105,
    116,
    104,
    32,
    37,
    115,
    32,
    101,
    120,
    99,
    101,
    112,
    116,
    105,
    111,
    110,
    32,
    111,
    102,
    32,
    116,
    121,
    112,
    101,
    32,
    37,
    115,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    116,
    101,
    114,
    109,
    105,
    110,
    97,
    116,
    105,
    110,
    103,
    32,
    119,
    105,
    116,
    104,
    32,
    37,
    115,
    32,
    102,
    111,
    114,
    101,
    105,
    103,
    110,
    32,
    101,
    120,
    99,
    101,
    112,
    116,
    105,
    111,
    110,
    0,
    0,
    0,
    116,
    101,
    114,
    109,
    105,
    110,
    97,
    116,
    105,
    110,
    103,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    112,
    116,
    104,
    114,
    101,
    97,
    100,
    95,
    111,
    110,
    99,
    101,
    32,
    102,
    97,
    105,
    108,
    117,
    114,
    101,
    32,
    105,
    110,
    32,
    95,
    95,
    99,
    120,
    97,
    95,
    103,
    101,
    116,
    95,
    103,
    108,
    111,
    98,
    97,
    108,
    115,
    95,
    102,
    97,
    115,
    116,
    40,
    41,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    99,
    97,
    110,
    110,
    111,
    116,
    32,
    99,
    114,
    101,
    97,
    116,
    101,
    32,
    112,
    116,
    104,
    114,
    101,
    97,
    100,
    32,
    107,
    101,
    121,
    32,
    102,
    111,
    114,
    32,
    95,
    95,
    99,
    120,
    97,
    95,
    103,
    101,
    116,
    95,
    103,
    108,
    111,
    98,
    97,
    108,
    115,
    40,
    41,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    99,
    97,
    110,
    110,
    111,
    116,
    32,
    122,
    101,
    114,
    111,
    32,
    111,
    117,
    116,
    32,
    116,
    104,
    114,
    101,
    97,
    100,
    32,
    118,
    97,
    108,
    117,
    101,
    32,
    102,
    111,
    114,
    32,
    95,
    95,
    99,
    120,
    97,
    95,
    103,
    101,
    116,
    95,
    103,
    108,
    111,
    98,
    97,
    108,
    115,
    40,
    41,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    192,
    106,
    0,
    0,
    220,
    0,
    0,
    0,
    221,
    0,
    0,
    0,
    73,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    115,
    116,
    100,
    58,
    58,
    98,
    97,
    100,
    95,
    97,
    108,
    108,
    111,
    99,
    0,
    0,
    83,
    116,
    57,
    98,
    97,
    100,
    95,
    97,
    108,
    108,
    111,
    99,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    176,
    106,
    0,
    0,
    88,
    107,
    0,
    0,
    0,
    0,
    0,
    0,
    116,
    101,
    114,
    109,
    105,
    110,
    97,
    116,
    101,
    95,
    104,
    97,
    110,
    100,
    108,
    101,
    114,
    32,
    117,
    110,
    101,
    120,
    112,
    101,
    99,
    116,
    101,
    100,
    108,
    121,
    32,
    114,
    101,
    116,
    117,
    114,
    110,
    101,
    100,
    0,
    116,
    101,
    114,
    109,
    105,
    110,
    97,
    116,
    101,
    95,
    104,
    97,
    110,
    100,
    108,
    101,
    114,
    32,
    117,
    110,
    101,
    120,
    112,
    101,
    99,
    116,
    101,
    100,
    108,
    121,
    32,
    116,
    104,
    114,
    101,
    119,
    32,
    97,
    110,
    32,
    101,
    120,
    99,
    101,
    112,
    116,
    105,
    111,
    110,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    115,
    116,
    100,
    58,
    58,
    101,
    120,
    99,
    101,
    112,
    116,
    105,
    111,
    110,
    0,
    0,
    83,
    116,
    57,
    101,
    120,
    99,
    101,
    112,
    116,
    105,
    111,
    110,
    0,
    0,
    0,
    0,
    160,
    109,
    0,
    0,
    72,
    107,
    0,
    0,
    0,
    0,
    0,
    0,
    160,
    107,
    0,
    0,
    222,
    0,
    0,
    0,
    223,
    0,
    0,
    0,
    74,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    72,
    108,
    0,
    0,
    224,
    0,
    0,
    0,
    225,
    0,
    0,
    0,
    7,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    83,
    116,
    49,
    49,
    108,
    111,
    103,
    105,
    99,
    95,
    101,
    114,
    114,
    111,
    114,
    0,
    8,
    111,
    0,
    0,
    144,
    107,
    0,
    0,
    88,
    107,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    224,
    107,
    0,
    0,
    222,
    0,
    0,
    0,
    226,
    0,
    0,
    0,
    74,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    83,
    116,
    49,
    50,
    108,
    101,
    110,
    103,
    116,
    104,
    95,
    101,
    114,
    114,
    111,
    114,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    200,
    107,
    0,
    0,
    160,
    107,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    32,
    108,
    0,
    0,
    222,
    0,
    0,
    0,
    227,
    0,
    0,
    0,
    74,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    83,
    116,
    49,
    50,
    111,
    117,
    116,
    95,
    111,
    102,
    95,
    114,
    97,
    110,
    103,
    101,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    8,
    108,
    0,
    0,
    160,
    107,
    0,
    0,
    0,
    0,
    0,
    0,
    83,
    116,
    49,
    51,
    114,
    117,
    110,
    116,
    105,
    109,
    101,
    95,
    101,
    114,
    114,
    111,
    114,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    48,
    108,
    0,
    0,
    88,
    107,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    168,
    108,
    0,
    0,
    228,
    0,
    0,
    0,
    229,
    0,
    0,
    0,
    75,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    115,
    116,
    100,
    58,
    58,
    98,
    97,
    100,
    95,
    99,
    97,
    115,
    116,
    0,
    0,
    0,
    83,
    116,
    57,
    116,
    121,
    112,
    101,
    95,
    105,
    110,
    102,
    111,
    0,
    0,
    0,
    0,
    160,
    109,
    0,
    0,
    128,
    108,
    0,
    0,
    83,
    116,
    56,
    98,
    97,
    100,
    95,
    99,
    97,
    115,
    116,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    152,
    108,
    0,
    0,
    88,
    107,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    49,
    48,
    95,
    95,
    99,
    120,
    120,
    97,
    98,
    105,
    118,
    49,
    49,
    54,
    95,
    95,
    115,
    104,
    105,
    109,
    95,
    116,
    121,
    112,
    101,
    95,
    105,
    110,
    102,
    111,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    184,
    108,
    0,
    0,
    144,
    108,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    49,
    48,
    95,
    95,
    99,
    120,
    120,
    97,
    98,
    105,
    118,
    49,
    49,
    55,
    95,
    95,
    99,
    108,
    97,
    115,
    115,
    95,
    116,
    121,
    112,
    101,
    95,
    105,
    110,
    102,
    111,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    240,
    108,
    0,
    0,
    224,
    108,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    49,
    48,
    95,
    95,
    99,
    120,
    120,
    97,
    98,
    105,
    118,
    49,
    49,
    57,
    95,
    95,
    112,
    111,
    105,
    110,
    116,
    101,
    114,
    95,
    116,
    121,
    112,
    101,
    95,
    105,
    110,
    102,
    111,
    69,
    0,
    0,
    0,
    0,
    0,
    78,
    49,
    48,
    95,
    95,
    99,
    120,
    120,
    97,
    98,
    105,
    118,
    49,
    49,
    55,
    95,
    95,
    112,
    98,
    97,
    115,
    101,
    95,
    116,
    121,
    112,
    101,
    95,
    105,
    110,
    102,
    111,
    69,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    80,
    109,
    0,
    0,
    224,
    108,
    0,
    0,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    40,
    109,
    0,
    0,
    120,
    109,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    24,
    109,
    0,
    0,
    230,
    0,
    0,
    0,
    231,
    0,
    0,
    0,
    232,
    0,
    0,
    0,
    233,
    0,
    0,
    0,
    22,
    0,
    0,
    0,
    14,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    136,
    109,
    0,
    0,
    230,
    0,
    0,
    0,
    234,
    0,
    0,
    0,
    232,
    0,
    0,
    0,
    233,
    0,
    0,
    0,
    23,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    40,
    110,
    0,
    0,
    230,
    0,
    0,
    0,
    235,
    0,
    0,
    0,
    232,
    0,
    0,
    0,
    233,
    0,
    0,
    0,
    24,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    78,
    49,
    48,
    95,
    95,
    99,
    120,
    120,
    97,
    98,
    105,
    118,
    49,
    50,
    51,
    95,
    95,
    102,
    117,
    110,
    100,
    97,
    109,
    101,
    110,
    116,
    97,
    108,
    95,
    116,
    121,
    112,
    101,
    95,
    105,
    110,
    102,
    111,
    69,
    0,
    8,
    111,
    0,
    0,
    0,
    110,
    0,
    0,
    224,
    108,
    0,
    0,
    0,
    0,
    0,
    0,
    118,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    232,
    109,
    0,
    0,
    56,
    110,
    0,
    0,
    68,
    110,
    0,
    0,
    0,
    0,
    0,
    0,
    232,
    109,
    0,
    0,
    72,
    110,
    0,
    0,
    98,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    232,
    109,
    0,
    0,
    88,
    110,
    0,
    0,
    99,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    232,
    109,
    0,
    0,
    104,
    110,
    0,
    0,
    104,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    232,
    109,
    0,
    0,
    120,
    110,
    0,
    0,
    97,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    232,
    109,
    0,
    0,
    136,
    110,
    0,
    0,
    232,
    109,
    0,
    0,
    160,
    36,
    0,
    0,
    232,
    109,
    0,
    0,
    152,
    36,
    0,
    0,
    105,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    232,
    109,
    0,
    0,
    168,
    110,
    0,
    0,
    106,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    232,
    109,
    0,
    0,
    184,
    110,
    0,
    0,
    232,
    109,
    0,
    0,
    120,
    69,
    0,
    0,
    109,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    232,
    109,
    0,
    0,
    208,
    110,
    0,
    0,
    102,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    232,
    109,
    0,
    0,
    224,
    110,
    0,
    0,
    100,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    232,
    109,
    0,
    0,
    240,
    110,
    0,
    0,
    0,
    0,
    0,
    0,
    80,
    111,
    0,
    0,
    230,
    0,
    0,
    0,
    236,
    0,
    0,
    0,
    232,
    0,
    0,
    0,
    233,
    0,
    0,
    0,
    22,
    0,
    0,
    0,
    15,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    7,
    0,
    0,
    0,
    78,
    49,
    48,
    95,
    95,
    99,
    120,
    120,
    97,
    98,
    105,
    118,
    49,
    50,
    48,
    95,
    95,
    115,
    105,
    95,
    99,
    108,
    97,
    115,
    115,
    95,
    116,
    121,
    112,
    101,
    95,
    105,
    110,
    102,
    111,
    69,
    0,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    40,
    111,
    0,
    0,
    24,
    109,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    176,
    111,
    0,
    0,
    230,
    0,
    0,
    0,
    237,
    0,
    0,
    0,
    232,
    0,
    0,
    0,
    233,
    0,
    0,
    0,
    22,
    0,
    0,
    0,
    16,
    0,
    0,
    0,
    3,
    0,
    0,
    0,
    8,
    0,
    0,
    0,
    78,
    49,
    48,
    95,
    95,
    99,
    120,
    120,
    97,
    98,
    105,
    118,
    49,
    50,
    49,
    95,
    95,
    118,
    109,
    105,
    95,
    99,
    108,
    97,
    115,
    115,
    95,
    116,
    121,
    112,
    101,
    95,
    105,
    110,
    102,
    111,
    69,
    0,
    0,
    0,
    8,
    111,
    0,
    0,
    136,
    111,
    0,
    0,
    24,
    109,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    10,
    11,
    12,
    13,
    14,
    15,
    16,
    17,
    18,
    19,
    20,
    21,
    22,
    23,
    24,
    25,
    26,
    27,
    28,
    29,
    30,
    31,
    32,
    33,
    34,
    35,
    255,
    255,
    255,
    255,
    255,
    255,
    10,
    11,
    12,
    13,
    14,
    15,
    16,
    17,
    18,
    19,
    20,
    21,
    22,
    23,
    24,
    25,
    26,
    27,
    28,
    29,
    30,
    31,
    32,
    33,
    34,
    35,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    2,
    4,
    7,
    3,
    6,
    5,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    105,
    110,
    102,
    105,
    110,
    105,
    116,
    121,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    95,
    112,
    137,
    0,
    255,
    9,
    47,
    15,
    10,
    0,
    0,
    0,
    100,
    0,
    0,
    0,
    232,
    3,
    0,
    0,
    16,
    39,
    0,
    0,
    160,
    134,
    1,
    0,
    64,
    66,
    15,
    0,
    128,
    150,
    152,
    0,
    0,
    225,
    245,
    5,
    17,
    0,
    10,
    0,
    17,
    17,
    17,
    0,
    0,
    0,
    0,
    5,
    0,
    0,
    0,
    0,
    0,
    0,
    9,
    0,
    0,
    0,
    0,
    11,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    17,
    0,
    15,
    10,
    17,
    17,
    17,
    3,
    10,
    7,
    0,
    1,
    19,
    9,
    11,
    11,
    0,
    0,
    9,
    6,
    11,
    0,
    0,
    11,
    0,
    6,
    17,
    0,
    0,
    0,
    17,
    17,
    17,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    11,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    17,
    0,
    10,
    10,
    17,
    17,
    17,
    0,
    10,
    0,
    0,
    2,
    0,
    9,
    11,
    0,
    0,
    0,
    9,
    0,
    11,
    0,
    0,
    11,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    12,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    12,
    0,
    0,
    0,
    0,
    12,
    0,
    0,
    0,
    0,
    9,
    12,
    0,
    0,
    0,
    0,
    0,
    12,
    0,
    0,
    12,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    14,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    13,
    0,
    0,
    0,
    4,
    13,
    0,
    0,
    0,
    0,
    9,
    14,
    0,
    0,
    0,
    0,
    0,
    14,
    0,
    0,
    14,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    16,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    15,
    0,
    0,
    0,
    0,
    15,
    0,
    0,
    0,
    0,
    9,
    16,
    0,
    0,
    0,
    0,
    0,
    16,
    0,
    0,
    16,
    0,
    0,
    18,
    0,
    0,
    0,
    18,
    18,
    18,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    18,
    0,
    0,
    0,
    18,
    18,
    18,
    0,
    0,
    0,
    0,
    0,
    0,
    9,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    11,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    10,
    0,
    0,
    0,
    0,
    10,
    0,
    0,
    0,
    0,
    9,
    11,
    0,
    0,
    0,
    0,
    0,
    11,
    0,
    0,
    11,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    12,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    12,
    0,
    0,
    0,
    0,
    12,
    0,
    0,
    0,
    0,
    9,
    12,
    0,
    0,
    0,
    0,
    0,
    12,
    0,
    0,
    12,
    0,
    0,
    45,
    43,
    32,
    32,
    32,
    48,
    88,
    48,
    120,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    40,
    110,
    117,
    108,
    108,
    41,
    0,
    0,
    45,
    48,
    88,
    43,
    48,
    88,
    32,
    48,
    88,
    45,
    48,
    120,
    43,
    48,
    120,
    32,
    48,
    120,
    0,
    0,
    0,
    0,
    0,
    0,
    105,
    110,
    102,
    0,
    0,
    0,
    0,
    0,
    73,
    78,
    70,
    0,
    0,
    0,
    0,
    0,
    110,
    97,
    110,
    0,
    0,
    0,
    0,
    0,
    78,
    65,
    78,
    0,
    0,
    0,
    0,
    0,
    48,
    49,
    50,
    51,
    52,
    53,
    54,
    55,
    56,
    57,
    65,
    66,
    67,
    68,
    69,
    70,
    46,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    25,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    255,
    255,
    255,
    255,
    255,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0
  ],
  'i8',
  ALLOC_NONE,
  Runtime.GLOBAL_BASE + 25240
);
var tempDoublePtr = Runtime.alignMemory(allocate(12, 'i8', ALLOC_STATIC), 8);
assert(tempDoublePtr % 8 == 0);
function copyTempFloat(ptr) {
  HEAP8[tempDoublePtr] = HEAP8[ptr];
  HEAP8[tempDoublePtr + 1] = HEAP8[ptr + 1];
  HEAP8[tempDoublePtr + 2] = HEAP8[ptr + 2];
  HEAP8[tempDoublePtr + 3] = HEAP8[ptr + 3];
}
function copyTempDouble(ptr) {
  HEAP8[tempDoublePtr] = HEAP8[ptr];
  HEAP8[tempDoublePtr + 1] = HEAP8[ptr + 1];
  HEAP8[tempDoublePtr + 2] = HEAP8[ptr + 2];
  HEAP8[tempDoublePtr + 3] = HEAP8[ptr + 3];
  HEAP8[tempDoublePtr + 4] = HEAP8[ptr + 4];
  HEAP8[tempDoublePtr + 5] = HEAP8[ptr + 5];
  HEAP8[tempDoublePtr + 6] = HEAP8[ptr + 6];
  HEAP8[tempDoublePtr + 7] = HEAP8[ptr + 7];
}
function _atexit(func, arg) {
  __ATEXIT__.unshift({func: func, arg: arg});
}
function ___cxa_atexit() {
  return _atexit.apply(null, arguments);
}
Module['_i64Subtract'] = _i64Subtract;
Module['_i64Add'] = _i64Add;
function __ZSt18uncaught_exceptionv() {
  return !!__ZSt18uncaught_exceptionv.uncaught_exception;
}
var EXCEPTIONS = {
  last: 0,
  caught: [],
  infos: {},
  deAdjust: function(adjusted) {
    if (!adjusted || EXCEPTIONS.infos[adjusted]) return adjusted;
    for (var ptr in EXCEPTIONS.infos) {
      var info = EXCEPTIONS.infos[ptr];
      if (info.adjusted === adjusted) {
        return ptr;
      }
    }
    return adjusted;
  },
  addRef: function(ptr) {
    if (!ptr) return;
    var info = EXCEPTIONS.infos[ptr];
    info.refcount++;
  },
  decRef: function(ptr) {
    if (!ptr) return;
    var info = EXCEPTIONS.infos[ptr];
    assert(info.refcount > 0);
    info.refcount--;
    if (info.refcount === 0) {
      if (info.destructor) {
        Runtime.dynCall('vi', info.destructor, [ptr]);
      }
      delete EXCEPTIONS.infos[ptr];
      ___cxa_free_exception(ptr);
    }
  },
  clearRef: function(ptr) {
    if (!ptr) return;
    var info = EXCEPTIONS.infos[ptr];
    info.refcount = 0;
  }
};
function ___resumeException(ptr) {
  if (!EXCEPTIONS.last) {
    EXCEPTIONS.last = ptr;
  }
  EXCEPTIONS.clearRef(EXCEPTIONS.deAdjust(ptr));
  throw ptr;
}
function ___cxa_find_matching_catch() {
  var thrown = EXCEPTIONS.last;
  if (!thrown) {
    return (asm['setTempRet0'](0), 0) | 0;
  }
  var info = EXCEPTIONS.infos[thrown];
  var throwntype = info.type;
  if (!throwntype) {
    return (asm['setTempRet0'](0), thrown) | 0;
  }
  var typeArray = Array.prototype.slice.call(arguments);
  var pointer = Module['___cxa_is_pointer_type'](throwntype);
  if (!___cxa_find_matching_catch.buffer) ___cxa_find_matching_catch.buffer = _malloc(4);
  HEAP32[___cxa_find_matching_catch.buffer >> 2] = thrown;
  thrown = ___cxa_find_matching_catch.buffer;
  for (var i = 0; i < typeArray.length; i++) {
    if (typeArray[i] && Module['___cxa_can_catch'](typeArray[i], throwntype, thrown)) {
      thrown = HEAP32[thrown >> 2];
      info.adjusted = thrown;
      return (asm['setTempRet0'](typeArray[i]), thrown) | 0;
    }
  }
  thrown = HEAP32[thrown >> 2];
  return (asm['setTempRet0'](throwntype), thrown) | 0;
}
function ___cxa_throw(ptr, type, destructor) {
  EXCEPTIONS.infos[ptr] = {
    ptr: ptr,
    adjusted: ptr,
    type: type,
    destructor: destructor,
    refcount: 0
  };
  EXCEPTIONS.last = ptr;
  if (!('uncaught_exception' in __ZSt18uncaught_exceptionv)) {
    __ZSt18uncaught_exceptionv.uncaught_exception = 1;
  } else {
    __ZSt18uncaught_exceptionv.uncaught_exception++;
  }
  throw ptr;
}
function getShiftFromSize(size) {
  switch (size) {
    case 1:
      return 0;
    case 2:
      return 1;
    case 4:
      return 2;
    case 8:
      return 3;
    default:
      throw new TypeError('Unknown type size: ' + size);
  }
}
function embind_init_charCodes() {
  var codes = new Array(256);
  for (var i = 0; i < 256; ++i) {
    codes[i] = String.fromCharCode(i);
  }
  embind_charCodes = codes;
}
var embind_charCodes = undefined;
function readLatin1String(ptr) {
  var ret = '';
  var c = ptr;
  while (HEAPU8[c]) {
    ret += embind_charCodes[HEAPU8[c++]];
  }
  return ret;
}
var awaitingDependencies = {};
var registeredTypes = {};
var typeDependencies = {};
var char_0 = 48;
var char_9 = 57;
function makeLegalFunctionName(name) {
  if (undefined === name) {
    return '_unknown';
  }
  name = name.replace(/[^a-zA-Z0-9_]/g, '$');
  var f = name.charCodeAt(0);
  if (f >= char_0 && f <= char_9) {
    return '_' + name;
  } else {
    return name;
  }
}
function createNamedFunction(name, body) {
  name = makeLegalFunctionName(name);
  return new Function(
    'body',
    'return function ' +
      name +
      '() {\n' +
      '    "use strict";' +
      '    return body.apply(this, arguments);\n' +
      '};\n'
  )(body);
}
function extendError(baseErrorType, errorName) {
  var errorClass = createNamedFunction(errorName, function(message) {
    this.name = errorName;
    this.message = message;
    var stack = new Error(message).stack;
    if (stack !== undefined) {
      this.stack = this.toString() + '\n' + stack.replace(/^Error(:[^\n]*)?\n/, '');
    }
  });
  errorClass.prototype = Object.create(baseErrorType.prototype);
  errorClass.prototype.constructor = errorClass;
  errorClass.prototype.toString = function() {
    if (this.message === undefined) {
      return this.name;
    } else {
      return this.name + ': ' + this.message;
    }
  };
  return errorClass;
}
var BindingError = undefined;
function throwBindingError(message) {
  throw new BindingError(message);
}
var InternalError = undefined;
function throwInternalError(message) {
  throw new InternalError(message);
}
function whenDependentTypesAreResolved(myTypes, dependentTypes, getTypeConverters) {
  myTypes.forEach(function(type) {
    typeDependencies[type] = dependentTypes;
  });
  function onComplete(typeConverters) {
    var myTypeConverters = getTypeConverters(typeConverters);
    if (myTypeConverters.length !== myTypes.length) {
      throwInternalError('Mismatched type converter count');
    }
    for (var i = 0; i < myTypes.length; ++i) {
      registerType(myTypes[i], myTypeConverters[i]);
    }
  }
  var typeConverters = new Array(dependentTypes.length);
  var unregisteredTypes = [];
  var registered = 0;
  dependentTypes.forEach(function(dt, i) {
    if (registeredTypes.hasOwnProperty(dt)) {
      typeConverters[i] = registeredTypes[dt];
    } else {
      unregisteredTypes.push(dt);
      if (!awaitingDependencies.hasOwnProperty(dt)) {
        awaitingDependencies[dt] = [];
      }
      awaitingDependencies[dt].push(function() {
        typeConverters[i] = registeredTypes[dt];
        ++registered;
        if (registered === unregisteredTypes.length) {
          onComplete(typeConverters);
        }
      });
    }
  });
  if (0 === unregisteredTypes.length) {
    onComplete(typeConverters);
  }
}
function registerType(rawType, registeredInstance, options) {
  options = options || {};
  if (!('argPackAdvance' in registeredInstance)) {
    throw new TypeError('registerType registeredInstance requires argPackAdvance');
  }
  var name = registeredInstance.name;
  if (!rawType) {
    throwBindingError('type "' + name + '" must have a positive integer typeid pointer');
  }
  if (registeredTypes.hasOwnProperty(rawType)) {
    if (options.ignoreDuplicateRegistrations) {
      return;
    } else {
      throwBindingError("Cannot register type '" + name + "' twice");
    }
  }
  registeredTypes[rawType] = registeredInstance;
  delete typeDependencies[rawType];
  if (awaitingDependencies.hasOwnProperty(rawType)) {
    var callbacks = awaitingDependencies[rawType];
    delete awaitingDependencies[rawType];
    callbacks.forEach(function(cb) {
      cb();
    });
  }
}
function __embind_register_bool(rawType, name, size, trueValue, falseValue) {
  var shift = getShiftFromSize(size);
  name = readLatin1String(name);
  registerType(rawType, {
    name: name,
    fromWireType: function(wt) {
      return !!wt;
    },
    toWireType: function(destructors, o) {
      return o ? trueValue : falseValue;
    },
    argPackAdvance: 8,
    readValueFromPointer: function(pointer) {
      var heap;
      if (size === 1) {
        heap = HEAP8;
      } else if (size === 2) {
        heap = HEAP16;
      } else if (size === 4) {
        heap = HEAP32;
      } else {
        throw new TypeError('Unknown boolean type size: ' + name);
      }
      return this['fromWireType'](heap[pointer >> shift]);
    },
    destructorFunction: null
  });
}
function _pthread_mutex_lock() {}
function _free() {}
Module['_free'] = _free;
function _malloc(bytes) {
  var ptr = Runtime.dynamicAlloc(bytes + 8);
  return (ptr + 8) & 4294967288;
}
Module['_malloc'] = _malloc;
function simpleReadValueFromPointer(pointer) {
  return this['fromWireType'](HEAPU32[pointer >> 2]);
}
function __embind_register_std_string(rawType, name) {
  name = readLatin1String(name);
  registerType(rawType, {
    name: name,
    fromWireType: function(value) {
      var length = HEAPU32[value >> 2];
      var a = new Array(length);
      for (var i = 0; i < length; ++i) {
        a[i] = String.fromCharCode(HEAPU8[value + 4 + i]);
      }
      _free(value);
      return a.join('');
    },
    toWireType: function(destructors, value) {
      if (value instanceof ArrayBuffer) {
        value = new Uint8Array(value);
      }
      function getTAElement(ta, index) {
        return ta[index];
      }
      function getStringElement(string, index) {
        return string.charCodeAt(index);
      }
      var getElement;
      if (value instanceof Uint8Array) {
        getElement = getTAElement;
      } else if (value instanceof Int8Array) {
        getElement = getTAElement;
      } else if (typeof value === 'string') {
        getElement = getStringElement;
      } else {
        throwBindingError('Cannot pass non-string to std::string');
      }
      var length = value.length;
      var ptr = _malloc(4 + length);
      HEAPU32[ptr >> 2] = length;
      for (var i = 0; i < length; ++i) {
        var charCode = getElement(value, i);
        if (charCode > 255) {
          _free(ptr);
          throwBindingError('String has UTF-16 code units that do not fit in 8 bits');
        }
        HEAPU8[ptr + 4 + i] = charCode;
      }
      if (destructors !== null) {
        destructors.push(_free, ptr);
      }
      return ptr;
    },
    argPackAdvance: 8,
    readValueFromPointer: simpleReadValueFromPointer,
    destructorFunction: function(ptr) {
      _free(ptr);
    }
  });
}
function __embind_register_std_wstring(rawType, charSize, name) {
  name = readLatin1String(name);
  var HEAP, shift;
  if (charSize === 2) {
    HEAP = HEAPU16;
    shift = 1;
  } else if (charSize === 4) {
    HEAP = HEAPU32;
    shift = 2;
  }
  registerType(rawType, {
    name: name,
    fromWireType: function(value) {
      var length = HEAPU32[value >> 2];
      var a = new Array(length);
      var start = (value + 4) >> shift;
      for (var i = 0; i < length; ++i) {
        a[i] = String.fromCharCode(HEAP[start + i]);
      }
      _free(value);
      return a.join('');
    },
    toWireType: function(destructors, value) {
      var length = value.length;
      var ptr = _malloc(4 + length * charSize);
      HEAPU32[ptr >> 2] = length;
      var start = (ptr + 4) >> shift;
      for (var i = 0; i < length; ++i) {
        HEAP[start + i] = value.charCodeAt(i);
      }
      if (destructors !== null) {
        destructors.push(_free, ptr);
      }
      return ptr;
    },
    argPackAdvance: 8,
    readValueFromPointer: simpleReadValueFromPointer,
    destructorFunction: function(ptr) {
      _free(ptr);
    }
  });
}
var ERRNO_CODES = {
  EPERM: 1,
  ENOENT: 2,
  ESRCH: 3,
  EINTR: 4,
  EIO: 5,
  ENXIO: 6,
  E2BIG: 7,
  ENOEXEC: 8,
  EBADF: 9,
  ECHILD: 10,
  EAGAIN: 11,
  EWOULDBLOCK: 11,
  ENOMEM: 12,
  EACCES: 13,
  EFAULT: 14,
  ENOTBLK: 15,
  EBUSY: 16,
  EEXIST: 17,
  EXDEV: 18,
  ENODEV: 19,
  ENOTDIR: 20,
  EISDIR: 21,
  EINVAL: 22,
  ENFILE: 23,
  EMFILE: 24,
  ENOTTY: 25,
  ETXTBSY: 26,
  EFBIG: 27,
  ENOSPC: 28,
  ESPIPE: 29,
  EROFS: 30,
  EMLINK: 31,
  EPIPE: 32,
  EDOM: 33,
  ERANGE: 34,
  ENOMSG: 42,
  EIDRM: 43,
  ECHRNG: 44,
  EL2NSYNC: 45,
  EL3HLT: 46,
  EL3RST: 47,
  ELNRNG: 48,
  EUNATCH: 49,
  ENOCSI: 50,
  EL2HLT: 51,
  EDEADLK: 35,
  ENOLCK: 37,
  EBADE: 52,
  EBADR: 53,
  EXFULL: 54,
  ENOANO: 55,
  EBADRQC: 56,
  EBADSLT: 57,
  EDEADLOCK: 35,
  EBFONT: 59,
  ENOSTR: 60,
  ENODATA: 61,
  ETIME: 62,
  ENOSR: 63,
  ENONET: 64,
  ENOPKG: 65,
  EREMOTE: 66,
  ENOLINK: 67,
  EADV: 68,
  ESRMNT: 69,
  ECOMM: 70,
  EPROTO: 71,
  EMULTIHOP: 72,
  EDOTDOT: 73,
  EBADMSG: 74,
  ENOTUNIQ: 76,
  EBADFD: 77,
  EREMCHG: 78,
  ELIBACC: 79,
  ELIBBAD: 80,
  ELIBSCN: 81,
  ELIBMAX: 82,
  ELIBEXEC: 83,
  ENOSYS: 38,
  ENOTEMPTY: 39,
  ENAMETOOLONG: 36,
  ELOOP: 40,
  EOPNOTSUPP: 95,
  EPFNOSUPPORT: 96,
  ECONNRESET: 104,
  ENOBUFS: 105,
  EAFNOSUPPORT: 97,
  EPROTOTYPE: 91,
  ENOTSOCK: 88,
  ENOPROTOOPT: 92,
  ESHUTDOWN: 108,
  ECONNREFUSED: 111,
  EADDRINUSE: 98,
  ECONNABORTED: 103,
  ENETUNREACH: 101,
  ENETDOWN: 100,
  ETIMEDOUT: 110,
  EHOSTDOWN: 112,
  EHOSTUNREACH: 113,
  EINPROGRESS: 115,
  EALREADY: 114,
  EDESTADDRREQ: 89,
  EMSGSIZE: 90,
  EPROTONOSUPPORT: 93,
  ESOCKTNOSUPPORT: 94,
  EADDRNOTAVAIL: 99,
  ENETRESET: 102,
  EISCONN: 106,
  ENOTCONN: 107,
  ETOOMANYREFS: 109,
  EUSERS: 87,
  EDQUOT: 122,
  ESTALE: 116,
  ENOTSUP: 95,
  ENOMEDIUM: 123,
  EILSEQ: 84,
  EOVERFLOW: 75,
  ECANCELED: 125,
  ENOTRECOVERABLE: 131,
  EOWNERDEAD: 130,
  ESTRPIPE: 86
};
var ERRNO_MESSAGES = {
  0: 'Success',
  1: 'Not super-user',
  2: 'No such file or directory',
  3: 'No such process',
  4: 'Interrupted system call',
  5: 'I/O error',
  6: 'No such device or address',
  7: 'Arg list too long',
  8: 'Exec format error',
  9: 'Bad file number',
  10: 'No children',
  11: 'No more processes',
  12: 'Not enough core',
  13: 'Permission denied',
  14: 'Bad address',
  15: 'Block device required',
  16: 'Mount device busy',
  17: 'File exists',
  18: 'Cross-device link',
  19: 'No such device',
  20: 'Not a directory',
  21: 'Is a directory',
  22: 'Invalid argument',
  23: 'Too many open files in system',
  24: 'Too many open files',
  25: 'Not a typewriter',
  26: 'Text file busy',
  27: 'File too large',
  28: 'No space left on device',
  29: 'Illegal seek',
  30: 'Read only file system',
  31: 'Too many links',
  32: 'Broken pipe',
  33: 'Math arg out of domain of func',
  34: 'Math result not representable',
  35: 'File locking deadlock error',
  36: 'File or path name too long',
  37: 'No record locks available',
  38: 'Function not implemented',
  39: 'Directory not empty',
  40: 'Too many symbolic links',
  42: 'No message of desired type',
  43: 'Identifier removed',
  44: 'Channel number out of range',
  45: 'Level 2 not synchronized',
  46: 'Level 3 halted',
  47: 'Level 3 reset',
  48: 'Link number out of range',
  49: 'Protocol driver not attached',
  50: 'No CSI structure available',
  51: 'Level 2 halted',
  52: 'Invalid exchange',
  53: 'Invalid request descriptor',
  54: 'Exchange full',
  55: 'No anode',
  56: 'Invalid request code',
  57: 'Invalid slot',
  59: 'Bad font file fmt',
  60: 'Device not a stream',
  61: 'No data (for no delay io)',
  62: 'Timer expired',
  63: 'Out of streams resources',
  64: 'Machine is not on the network',
  65: 'Package not installed',
  66: 'The object is remote',
  67: 'The link has been severed',
  68: 'Advertise error',
  69: 'Srmount error',
  70: 'Communication error on send',
  71: 'Protocol error',
  72: 'Multihop attempted',
  73: 'Cross mount point (not really error)',
  74: 'Trying to read unreadable message',
  75: 'Value too large for defined data type',
  76: 'Given log. name not unique',
  77: 'f.d. invalid for this operation',
  78: 'Remote address changed',
  79: 'Can   access a needed shared lib',
  80: 'Accessing a corrupted shared lib',
  81: '.lib section in a.out corrupted',
  82: 'Attempting to link in too many libs',
  83: 'Attempting to exec a shared library',
  84: 'Illegal byte sequence',
  86: 'Streams pipe error',
  87: 'Too many users',
  88: 'Socket operation on non-socket',
  89: 'Destination address required',
  90: 'Message too long',
  91: 'Protocol wrong type for socket',
  92: 'Protocol not available',
  93: 'Unknown protocol',
  94: 'Socket type not supported',
  95: 'Not supported',
  96: 'Protocol family not supported',
  97: 'Address family not supported by protocol family',
  98: 'Address already in use',
  99: 'Address not available',
  100: 'Network interface is not configured',
  101: 'Network is unreachable',
  102: 'Connection reset by network',
  103: 'Connection aborted',
  104: 'Connection reset by peer',
  105: 'No buffer space available',
  106: 'Socket is already connected',
  107: 'Socket is not connected',
  108: "Can't send after socket shutdown",
  109: 'Too many references',
  110: 'Connection timed out',
  111: 'Connection refused',
  112: 'Host is down',
  113: 'Host is unreachable',
  114: 'Socket already connected',
  115: 'Connection already in progress',
  116: 'Stale file handle',
  122: 'Quota exceeded',
  123: 'No medium (in tape drive)',
  125: 'Operation canceled',
  130: 'Previous owner died',
  131: 'State not recoverable'
};
var ___errno_state = 0;
function ___setErrNo(value) {
  HEAP32[___errno_state >> 2] = value;
  return value;
}
var PATH = {
  splitPath: function(filename) {
    var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
    return splitPathRe.exec(filename).slice(1);
  },
  normalizeArray: function(parts, allowAboveRoot) {
    var up = 0;
    for (var i = parts.length - 1; i >= 0; i--) {
      var last = parts[i];
      if (last === '.') {
        parts.splice(i, 1);
      } else if (last === '..') {
        parts.splice(i, 1);
        up++;
      } else if (up) {
        parts.splice(i, 1);
        up--;
      }
    }
    if (allowAboveRoot) {
      for (; up--; up) {
        parts.unshift('..');
      }
    }
    return parts;
  },
  normalize: function(path) {
    var isAbsolute = path.charAt(0) === '/',
      trailingSlash = path.substr(-1) === '/';
    path = PATH.normalizeArray(
      path.split('/').filter(function(p) {
        return !!p;
      }),
      !isAbsolute
    ).join('/');
    if (!path && !isAbsolute) {
      path = '.';
    }
    if (path && trailingSlash) {
      path += '/';
    }
    return (isAbsolute ? '/' : '') + path;
  },
  dirname: function(path) {
    var result = PATH.splitPath(path),
      root = result[0],
      dir = result[1];
    if (!root && !dir) {
      return '.';
    }
    if (dir) {
      dir = dir.substr(0, dir.length - 1);
    }
    return root + dir;
  },
  basename: function(path) {
    if (path === '/') return '/';
    var lastSlash = path.lastIndexOf('/');
    if (lastSlash === -1) return path;
    return path.substr(lastSlash + 1);
  },
  extname: function(path) {
    return PATH.splitPath(path)[3];
  },
  join: function() {
    var paths = Array.prototype.slice.call(arguments, 0);
    return PATH.normalize(paths.join('/'));
  },
  join2: function(l, r) {
    return PATH.normalize(l + '/' + r);
  },
  resolve: function() {
    var resolvedPath = '',
      resolvedAbsolute = false;
    for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
      var path = i >= 0 ? arguments[i] : FS.cwd();
      if (typeof path !== 'string') {
        throw new TypeError('Arguments to path.resolve must be strings');
      } else if (!path) {
        return '';
      }
      resolvedPath = path + '/' + resolvedPath;
      resolvedAbsolute = path.charAt(0) === '/';
    }
    resolvedPath = PATH.normalizeArray(
      resolvedPath.split('/').filter(function(p) {
        return !!p;
      }),
      !resolvedAbsolute
    ).join('/');
    return (resolvedAbsolute ? '/' : '') + resolvedPath || '.';
  },
  relative: function(from, to) {
    from = PATH.resolve(from).substr(1);
    to = PATH.resolve(to).substr(1);
    function trim(arr) {
      var start = 0;
      for (; start < arr.length; start++) {
        if (arr[start] !== '') break;
      }
      var end = arr.length - 1;
      for (; end >= 0; end--) {
        if (arr[end] !== '') break;
      }
      if (start > end) return [];
      return arr.slice(start, end - start + 1);
    }
    var fromParts = trim(from.split('/'));
    var toParts = trim(to.split('/'));
    var length = Math.min(fromParts.length, toParts.length);
    var samePartsLength = length;
    for (var i = 0; i < length; i++) {
      if (fromParts[i] !== toParts[i]) {
        samePartsLength = i;
        break;
      }
    }
    var outputParts = [];
    for (var i = samePartsLength; i < fromParts.length; i++) {
      outputParts.push('..');
    }
    outputParts = outputParts.concat(toParts.slice(samePartsLength));
    return outputParts.join('/');
  }
};
var TTY = {
  ttys: [],
  init: function() {},
  shutdown: function() {},
  register: function(dev, ops) {
    TTY.ttys[dev] = {input: [], output: [], ops: ops};
    FS.registerDevice(dev, TTY.stream_ops);
  },
  stream_ops: {
    open: function(stream) {
      var tty = TTY.ttys[stream.node.rdev];
      if (!tty) {
        throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
      }
      stream.tty = tty;
      stream.seekable = false;
    },
    close: function(stream) {
      if (stream.tty.output.length) {
        stream.tty.ops.put_char(stream.tty, 10);
      }
    },
    read: function(stream, buffer, offset, length, pos) {
      if (!stream.tty || !stream.tty.ops.get_char) {
        throw new FS.ErrnoError(ERRNO_CODES.ENXIO);
      }
      var bytesRead = 0;
      for (var i = 0; i < length; i++) {
        var result;
        try {
          result = stream.tty.ops.get_char(stream.tty);
        } catch (e) {
          throw new FS.ErrnoError(ERRNO_CODES.EIO);
        }
        if (result === undefined && bytesRead === 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
        }
        if (result === null || result === undefined) break;
        bytesRead++;
        buffer[offset + i] = result;
      }
      if (bytesRead) {
        stream.node.timestamp = Date.now();
      }
      return bytesRead;
    },
    write: function(stream, buffer, offset, length, pos) {
      if (!stream.tty || !stream.tty.ops.put_char) {
        throw new FS.ErrnoError(ERRNO_CODES.ENXIO);
      }
      for (var i = 0; i < length; i++) {
        try {
          stream.tty.ops.put_char(stream.tty, buffer[offset + i]);
        } catch (e) {
          throw new FS.ErrnoError(ERRNO_CODES.EIO);
        }
      }
      if (length) {
        stream.node.timestamp = Date.now();
      }
      return i;
    }
  },
  default_tty_ops: {
    get_char: function(tty) {
      if (!tty.input.length) {
        var result = null;
        if (ENVIRONMENT_IS_NODE) {
          result = process['stdin']['read']();
          if (!result) {
            if (process['stdin']['_readableState'] && process['stdin']['_readableState']['ended']) {
              return null;
            }
            return undefined;
          }
        } else if (typeof window != 'undefined' && typeof window.prompt == 'function') {
          result = window.prompt('Input: ');
          if (result !== null) {
            result += '\n';
          }
        } else if (typeof readline == 'function') {
          result = readline();
          if (result !== null) {
            result += '\n';
          }
        }
        if (!result) {
          return null;
        }
        tty.input = intArrayFromString(result, true);
      }
      return tty.input.shift();
    },
    put_char: function(tty, val) {
      if (val === null || val === 10) {
        Module['print'](tty.output.join(''));
        tty.output = [];
      } else {
        tty.output.push(TTY.utf8.processCChar(val));
      }
    }
  },
  default_tty1_ops: {
    put_char: function(tty, val) {
      if (val === null || val === 10) {
        Module['printErr'](tty.output.join(''));
        tty.output = [];
      } else {
        tty.output.push(TTY.utf8.processCChar(val));
      }
    }
  }
};
var MEMFS = {
  ops_table: null,
  mount: function(mount) {
    return MEMFS.createNode(null, '/', 16384 | 511, 0);
  },
  createNode: function(parent, name, mode, dev) {
    if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
      throw new FS.ErrnoError(ERRNO_CODES.EPERM);
    }
    if (!MEMFS.ops_table) {
      MEMFS.ops_table = {
        dir: {
          node: {
            getattr: MEMFS.node_ops.getattr,
            setattr: MEMFS.node_ops.setattr,
            lookup: MEMFS.node_ops.lookup,
            mknod: MEMFS.node_ops.mknod,
            rename: MEMFS.node_ops.rename,
            unlink: MEMFS.node_ops.unlink,
            rmdir: MEMFS.node_ops.rmdir,
            readdir: MEMFS.node_ops.readdir,
            symlink: MEMFS.node_ops.symlink
          },
          stream: {llseek: MEMFS.stream_ops.llseek}
        },
        file: {
          node: {getattr: MEMFS.node_ops.getattr, setattr: MEMFS.node_ops.setattr},
          stream: {
            llseek: MEMFS.stream_ops.llseek,
            read: MEMFS.stream_ops.read,
            write: MEMFS.stream_ops.write,
            allocate: MEMFS.stream_ops.allocate,
            mmap: MEMFS.stream_ops.mmap
          }
        },
        link: {
          node: {
            getattr: MEMFS.node_ops.getattr,
            setattr: MEMFS.node_ops.setattr,
            readlink: MEMFS.node_ops.readlink
          },
          stream: {}
        },
        chrdev: {
          node: {getattr: MEMFS.node_ops.getattr, setattr: MEMFS.node_ops.setattr},
          stream: FS.chrdev_stream_ops
        }
      };
    }
    var node = FS.createNode(parent, name, mode, dev);
    if (FS.isDir(node.mode)) {
      node.node_ops = MEMFS.ops_table.dir.node;
      node.stream_ops = MEMFS.ops_table.dir.stream;
      node.contents = {};
    } else if (FS.isFile(node.mode)) {
      node.node_ops = MEMFS.ops_table.file.node;
      node.stream_ops = MEMFS.ops_table.file.stream;
      node.usedBytes = 0;
      node.contents = null;
    } else if (FS.isLink(node.mode)) {
      node.node_ops = MEMFS.ops_table.link.node;
      node.stream_ops = MEMFS.ops_table.link.stream;
    } else if (FS.isChrdev(node.mode)) {
      node.node_ops = MEMFS.ops_table.chrdev.node;
      node.stream_ops = MEMFS.ops_table.chrdev.stream;
    }
    node.timestamp = Date.now();
    if (parent) {
      parent.contents[name] = node;
    }
    return node;
  },
  getFileDataAsRegularArray: function(node) {
    if (node.contents && node.contents.subarray) {
      var arr = [];
      for (var i = 0; i < node.usedBytes; ++i) arr.push(node.contents[i]);
      return arr;
    }
    return node.contents;
  },
  getFileDataAsTypedArray: function(node) {
    if (!node.contents) return new Uint8Array();
    if (node.contents.subarray) return node.contents.subarray(0, node.usedBytes);
    return new Uint8Array(node.contents);
  },
  expandFileStorage: function(node, newCapacity) {
    if (node.contents && node.contents.subarray && newCapacity > node.contents.length) {
      node.contents = MEMFS.getFileDataAsRegularArray(node);
      node.usedBytes = node.contents.length;
    }
    if (!node.contents || node.contents.subarray) {
      var prevCapacity = node.contents ? node.contents.buffer.byteLength : 0;
      if (prevCapacity >= newCapacity) return;
      var CAPACITY_DOUBLING_MAX = 1024 * 1024;
      newCapacity = Math.max(
        newCapacity,
        (prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2 : 1.125)) | 0
      );
      if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256);
      var oldContents = node.contents;
      node.contents = new Uint8Array(newCapacity);
      if (node.usedBytes > 0) node.contents.set(oldContents.subarray(0, node.usedBytes), 0);
      return;
    }
    if (!node.contents && newCapacity > 0) node.contents = [];
    while (node.contents.length < newCapacity) node.contents.push(0);
  },
  resizeFileStorage: function(node, newSize) {
    if (node.usedBytes == newSize) return;
    if (newSize == 0) {
      node.contents = null;
      node.usedBytes = 0;
      return;
    }
    if (!node.contents || node.contents.subarray) {
      var oldContents = node.contents;
      node.contents = new Uint8Array(new ArrayBuffer(newSize));
      if (oldContents) {
        node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes)));
      }
      node.usedBytes = newSize;
      return;
    }
    if (!node.contents) node.contents = [];
    if (node.contents.length > newSize) node.contents.length = newSize;
    else while (node.contents.length < newSize) node.contents.push(0);
    node.usedBytes = newSize;
  },
  node_ops: {
    getattr: function(node) {
      var attr = {};
      attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
      attr.ino = node.id;
      attr.mode = node.mode;
      attr.nlink = 1;
      attr.uid = 0;
      attr.gid = 0;
      attr.rdev = node.rdev;
      if (FS.isDir(node.mode)) {
        attr.size = 4096;
      } else if (FS.isFile(node.mode)) {
        attr.size = node.usedBytes;
      } else if (FS.isLink(node.mode)) {
        attr.size = node.link.length;
      } else {
        attr.size = 0;
      }
      attr.atime = new Date(node.timestamp);
      attr.mtime = new Date(node.timestamp);
      attr.ctime = new Date(node.timestamp);
      attr.blksize = 4096;
      attr.blocks = Math.ceil(attr.size / attr.blksize);
      return attr;
    },
    setattr: function(node, attr) {
      if (attr.mode !== undefined) {
        node.mode = attr.mode;
      }
      if (attr.timestamp !== undefined) {
        node.timestamp = attr.timestamp;
      }
      if (attr.size !== undefined) {
        MEMFS.resizeFileStorage(node, attr.size);
      }
    },
    lookup: function(parent, name) {
      throw FS.genericErrors[ERRNO_CODES.ENOENT];
    },
    mknod: function(parent, name, mode, dev) {
      return MEMFS.createNode(parent, name, mode, dev);
    },
    rename: function(old_node, new_dir, new_name) {
      if (FS.isDir(old_node.mode)) {
        var new_node;
        try {
          new_node = FS.lookupNode(new_dir, new_name);
        } catch (e) {}
        if (new_node) {
          for (var i in new_node.contents) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
          }
        }
      }
      delete old_node.parent.contents[old_node.name];
      old_node.name = new_name;
      new_dir.contents[new_name] = old_node;
      old_node.parent = new_dir;
    },
    unlink: function(parent, name) {
      delete parent.contents[name];
    },
    rmdir: function(parent, name) {
      var node = FS.lookupNode(parent, name);
      for (var i in node.contents) {
        throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
      }
      delete parent.contents[name];
    },
    readdir: function(node) {
      var entries = ['.', '..'];
      for (var key in node.contents) {
        if (!node.contents.hasOwnProperty(key)) {
          continue;
        }
        entries.push(key);
      }
      return entries;
    },
    symlink: function(parent, newname, oldpath) {
      var node = MEMFS.createNode(parent, newname, 511 | 40960, 0);
      node.link = oldpath;
      return node;
    },
    readlink: function(node) {
      if (!FS.isLink(node.mode)) {
        throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
      }
      return node.link;
    }
  },
  stream_ops: {
    read: function(stream, buffer, offset, length, position) {
      var contents = stream.node.contents;
      if (position >= stream.node.usedBytes) return 0;
      var size = Math.min(stream.node.usedBytes - position, length);
      assert(size >= 0);
      if (size > 8 && contents.subarray) {
        buffer.set(contents.subarray(position, position + size), offset);
      } else {
        for (var i = 0; i < size; i++) buffer[offset + i] = contents[position + i];
      }
      return size;
    },
    write: function(stream, buffer, offset, length, position, canOwn) {
      if (!length) return 0;
      var node = stream.node;
      node.timestamp = Date.now();
      if (buffer.subarray && (!node.contents || node.contents.subarray)) {
        if (canOwn) {
          node.contents = buffer.subarray(offset, offset + length);
          node.usedBytes = length;
          return length;
        } else if (node.usedBytes === 0 && position === 0) {
          node.contents = new Uint8Array(buffer.subarray(offset, offset + length));
          node.usedBytes = length;
          return length;
        } else if (position + length <= node.usedBytes) {
          node.contents.set(buffer.subarray(offset, offset + length), position);
          return length;
        }
      }
      MEMFS.expandFileStorage(node, position + length);
      if (node.contents.subarray && buffer.subarray)
        node.contents.set(buffer.subarray(offset, offset + length), position);
      else
        for (var i = 0; i < length; i++) {
          node.contents[position + i] = buffer[offset + i];
        }
      node.usedBytes = Math.max(node.usedBytes, position + length);
      return length;
    },
    llseek: function(stream, offset, whence) {
      var position = offset;
      if (whence === 1) {
        position += stream.position;
      } else if (whence === 2) {
        if (FS.isFile(stream.node.mode)) {
          position += stream.node.usedBytes;
        }
      }
      if (position < 0) {
        throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
      }
      return position;
    },
    allocate: function(stream, offset, length) {
      MEMFS.expandFileStorage(stream.node, offset + length);
      stream.node.usedBytes = Math.max(stream.node.usedBytes, offset + length);
    },
    mmap: function(stream, buffer, offset, length, position, prot, flags) {
      if (!FS.isFile(stream.node.mode)) {
        throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
      }
      var ptr;
      var allocated;
      var contents = stream.node.contents;
      if (!(flags & 2) && (contents.buffer === buffer || contents.buffer === buffer.buffer)) {
        allocated = false;
        ptr = contents.byteOffset;
      } else {
        if (position > 0 || position + length < stream.node.usedBytes) {
          if (contents.subarray) {
            contents = contents.subarray(position, position + length);
          } else {
            contents = Array.prototype.slice.call(contents, position, position + length);
          }
        }
        allocated = true;
        ptr = _malloc(length);
        if (!ptr) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOMEM);
        }
        buffer.set(contents, ptr);
      }
      return {ptr: ptr, allocated: allocated};
    }
  }
};
var IDBFS = {
  dbs: {},
  indexedDB: function() {
    if (typeof indexedDB !== 'undefined') return indexedDB;
    var ret = null;
    if (typeof window === 'object')
      ret = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
    assert(ret, 'IDBFS used, but indexedDB not supported');
    return ret;
  },
  DB_VERSION: 21,
  DB_STORE_NAME: 'FILE_DATA',
  mount: function(mount) {
    return MEMFS.mount.apply(null, arguments);
  },
  syncfs: function(mount, populate, callback) {
    IDBFS.getLocalSet(mount, function(err, local) {
      if (err) return callback(err);
      IDBFS.getRemoteSet(mount, function(err, remote) {
        if (err) return callback(err);
        var src = populate ? remote : local;
        var dst = populate ? local : remote;
        IDBFS.reconcile(src, dst, callback);
      });
    });
  },
  getDB: function(name, callback) {
    var db = IDBFS.dbs[name];
    if (db) {
      return callback(null, db);
    }
    var req;
    try {
      req = IDBFS.indexedDB().open(name, IDBFS.DB_VERSION);
    } catch (e) {
      return callback(e);
    }
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      var transaction = e.target.transaction;
      var fileStore;
      if (db.objectStoreNames.contains(IDBFS.DB_STORE_NAME)) {
        fileStore = transaction.objectStore(IDBFS.DB_STORE_NAME);
      } else {
        fileStore = db.createObjectStore(IDBFS.DB_STORE_NAME);
      }
      fileStore.createIndex('timestamp', 'timestamp', {unique: false});
    };
    req.onsuccess = function() {
      db = req.result;
      IDBFS.dbs[name] = db;
      callback(null, db);
    };
    req.onerror = function() {
      callback(this.error);
    };
  },
  getLocalSet: function(mount, callback) {
    var entries = {};
    function isRealDir(p) {
      return p !== '.' && p !== '..';
    }
    function toAbsolute(root) {
      return function(p) {
        return PATH.join2(root, p);
      };
    }
    var check = FS.readdir(mount.mountpoint)
      .filter(isRealDir)
      .map(toAbsolute(mount.mountpoint));
    while (check.length) {
      var path = check.pop();
      var stat;
      try {
        stat = FS.stat(path);
      } catch (e) {
        return callback(e);
      }
      if (FS.isDir(stat.mode)) {
        check.push.apply(
          check,
          FS.readdir(path)
            .filter(isRealDir)
            .map(toAbsolute(path))
        );
      }
      entries[path] = {timestamp: stat.mtime};
    }
    return callback(null, {type: 'local', entries: entries});
  },
  getRemoteSet: function(mount, callback) {
    var entries = {};
    IDBFS.getDB(mount.mountpoint, function(err, db) {
      if (err) return callback(err);
      var transaction = db.transaction([IDBFS.DB_STORE_NAME], 'readonly');
      transaction.onerror = function() {
        callback(this.error);
      };
      var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
      var index = store.index('timestamp');
      index.openKeyCursor().onsuccess = function(event) {
        var cursor = event.target.result;
        if (!cursor) {
          return callback(null, {type: 'remote', db: db, entries: entries});
        }
        entries[cursor.primaryKey] = {timestamp: cursor.key};
        cursor.continue();
      };
    });
  },
  loadLocalEntry: function(path, callback) {
    var stat, node;
    try {
      var lookup = FS.lookupPath(path);
      node = lookup.node;
      stat = FS.stat(path);
    } catch (e) {
      return callback(e);
    }
    if (FS.isDir(stat.mode)) {
      return callback(null, {timestamp: stat.mtime, mode: stat.mode});
    } else if (FS.isFile(stat.mode)) {
      node.contents = MEMFS.getFileDataAsTypedArray(node);
      return callback(null, {timestamp: stat.mtime, mode: stat.mode, contents: node.contents});
    } else {
      return callback(new Error('node type not supported'));
    }
  },
  storeLocalEntry: function(path, entry, callback) {
    try {
      if (FS.isDir(entry.mode)) {
        FS.mkdir(path, entry.mode);
      } else if (FS.isFile(entry.mode)) {
        FS.writeFile(path, entry.contents, {encoding: 'binary', canOwn: true});
      } else {
        return callback(new Error('node type not supported'));
      }
      FS.chmod(path, entry.mode);
      FS.utime(path, entry.timestamp, entry.timestamp);
    } catch (e) {
      return callback(e);
    }
    callback(null);
  },
  removeLocalEntry: function(path, callback) {
    try {
      var lookup = FS.lookupPath(path);
      var stat = FS.stat(path);
      if (FS.isDir(stat.mode)) {
        FS.rmdir(path);
      } else if (FS.isFile(stat.mode)) {
        FS.unlink(path);
      }
    } catch (e) {
      return callback(e);
    }
    callback(null);
  },
  loadRemoteEntry: function(store, path, callback) {
    var req = store.get(path);
    req.onsuccess = function(event) {
      callback(null, event.target.result);
    };
    req.onerror = function() {
      callback(this.error);
    };
  },
  storeRemoteEntry: function(store, path, entry, callback) {
    var req = store.put(entry, path);
    req.onsuccess = function() {
      callback(null);
    };
    req.onerror = function() {
      callback(this.error);
    };
  },
  removeRemoteEntry: function(store, path, callback) {
    var req = store.delete(path);
    req.onsuccess = function() {
      callback(null);
    };
    req.onerror = function() {
      callback(this.error);
    };
  },
  reconcile: function(src, dst, callback) {
    var total = 0;
    var create = [];
    Object.keys(src.entries).forEach(function(key) {
      var e = src.entries[key];
      var e2 = dst.entries[key];
      if (!e2 || e.timestamp > e2.timestamp) {
        create.push(key);
        total++;
      }
    });
    var remove = [];
    Object.keys(dst.entries).forEach(function(key) {
      var e = dst.entries[key];
      var e2 = src.entries[key];
      if (!e2) {
        remove.push(key);
        total++;
      }
    });
    if (!total) {
      return callback(null);
    }
    var errored = false;
    var completed = 0;
    var db = src.type === 'remote' ? src.db : dst.db;
    var transaction = db.transaction([IDBFS.DB_STORE_NAME], 'readwrite');
    var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
    function done(err) {
      if (err) {
        if (!done.errored) {
          done.errored = true;
          return callback(err);
        }
        return;
      }
      if (++completed >= total) {
        return callback(null);
      }
    }
    transaction.onerror = function() {
      done(this.error);
    };
    create.sort().forEach(function(path) {
      if (dst.type === 'local') {
        IDBFS.loadRemoteEntry(store, path, function(err, entry) {
          if (err) return done(err);
          IDBFS.storeLocalEntry(path, entry, done);
        });
      } else {
        IDBFS.loadLocalEntry(path, function(err, entry) {
          if (err) return done(err);
          IDBFS.storeRemoteEntry(store, path, entry, done);
        });
      }
    });
    remove
      .sort()
      .reverse()
      .forEach(function(path) {
        if (dst.type === 'local') {
          IDBFS.removeLocalEntry(path, done);
        } else {
          IDBFS.removeRemoteEntry(store, path, done);
        }
      });
  }
};
var NODEFS = {
  isWindows: false,
  staticInit: function() {
    NODEFS.isWindows = !!process.platform.match(/^win/);
  },
  mount: function(mount) {
    assert(ENVIRONMENT_IS_NODE);
    return NODEFS.createNode(null, '/', NODEFS.getMode(mount.opts.root), 0);
  },
  createNode: function(parent, name, mode, dev) {
    if (!FS.isDir(mode) && !FS.isFile(mode) && !FS.isLink(mode)) {
      throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
    }
    var node = FS.createNode(parent, name, mode);
    node.node_ops = NODEFS.node_ops;
    node.stream_ops = NODEFS.stream_ops;
    return node;
  },
  getMode: function(path) {
    var stat;
    try {
      stat = fs.lstatSync(path);
      if (NODEFS.isWindows) {
        stat.mode = stat.mode | ((stat.mode & 146) >> 1);
      }
    } catch (e) {
      if (!e.code) throw e;
      throw new FS.ErrnoError(ERRNO_CODES[e.code]);
    }
    return stat.mode;
  },
  realPath: function(node) {
    var parts = [];
    while (node.parent !== node) {
      parts.push(node.name);
      node = node.parent;
    }
    parts.push(node.mount.opts.root);
    parts.reverse();
    return PATH.join.apply(null, parts);
  },
  flagsToPermissionStringMap: {
    0: 'r',
    1: 'r+',
    2: 'r+',
    64: 'r',
    65: 'r+',
    66: 'r+',
    129: 'rx+',
    193: 'rx+',
    514: 'w+',
    577: 'w',
    578: 'w+',
    705: 'wx',
    706: 'wx+',
    1024: 'a',
    1025: 'a',
    1026: 'a+',
    1089: 'a',
    1090: 'a+',
    1153: 'ax',
    1154: 'ax+',
    1217: 'ax',
    1218: 'ax+',
    4096: 'rs',
    4098: 'rs+'
  },
  flagsToPermissionString: function(flags) {
    if (flags in NODEFS.flagsToPermissionStringMap) {
      return NODEFS.flagsToPermissionStringMap[flags];
    } else {
      return flags;
    }
  },
  node_ops: {
    getattr: function(node) {
      var path = NODEFS.realPath(node);
      var stat;
      try {
        stat = fs.lstatSync(path);
      } catch (e) {
        if (!e.code) throw e;
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
      if (NODEFS.isWindows && !stat.blksize) {
        stat.blksize = 4096;
      }
      if (NODEFS.isWindows && !stat.blocks) {
        stat.blocks = ((stat.size + stat.blksize - 1) / stat.blksize) | 0;
      }
      return {
        dev: stat.dev,
        ino: stat.ino,
        mode: stat.mode,
        nlink: stat.nlink,
        uid: stat.uid,
        gid: stat.gid,
        rdev: stat.rdev,
        size: stat.size,
        atime: stat.atime,
        mtime: stat.mtime,
        ctime: stat.ctime,
        blksize: stat.blksize,
        blocks: stat.blocks
      };
    },
    setattr: function(node, attr) {
      var path = NODEFS.realPath(node);
      try {
        if (attr.mode !== undefined) {
          fs.chmodSync(path, attr.mode);
          node.mode = attr.mode;
        }
        if (attr.timestamp !== undefined) {
          var date = new Date(attr.timestamp);
          fs.utimesSync(path, date, date);
        }
        if (attr.size !== undefined) {
          fs.truncateSync(path, attr.size);
        }
      } catch (e) {
        if (!e.code) throw e;
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
    },
    lookup: function(parent, name) {
      var path = PATH.join2(NODEFS.realPath(parent), name);
      var mode = NODEFS.getMode(path);
      return NODEFS.createNode(parent, name, mode);
    },
    mknod: function(parent, name, mode, dev) {
      var node = NODEFS.createNode(parent, name, mode, dev);
      var path = NODEFS.realPath(node);
      try {
        if (FS.isDir(node.mode)) {
          fs.mkdirSync(path, node.mode);
        } else {
          fs.writeFileSync(path, '', {mode: node.mode});
        }
      } catch (e) {
        if (!e.code) throw e;
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
      return node;
    },
    rename: function(oldNode, newDir, newName) {
      var oldPath = NODEFS.realPath(oldNode);
      var newPath = PATH.join2(NODEFS.realPath(newDir), newName);
      try {
        fs.renameSync(oldPath, newPath);
      } catch (e) {
        if (!e.code) throw e;
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
    },
    unlink: function(parent, name) {
      var path = PATH.join2(NODEFS.realPath(parent), name);
      try {
        fs.unlinkSync(path);
      } catch (e) {
        if (!e.code) throw e;
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
    },
    rmdir: function(parent, name) {
      var path = PATH.join2(NODEFS.realPath(parent), name);
      try {
        fs.rmdirSync(path);
      } catch (e) {
        if (!e.code) throw e;
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
    },
    readdir: function(node) {
      var path = NODEFS.realPath(node);
      try {
        return fs.readdirSync(path);
      } catch (e) {
        if (!e.code) throw e;
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
    },
    symlink: function(parent, newName, oldPath) {
      var newPath = PATH.join2(NODEFS.realPath(parent), newName);
      try {
        fs.symlinkSync(oldPath, newPath);
      } catch (e) {
        if (!e.code) throw e;
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
    },
    readlink: function(node) {
      var path = NODEFS.realPath(node);
      try {
        return fs.readlinkSync(path);
      } catch (e) {
        if (!e.code) throw e;
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
    }
  },
  stream_ops: {
    open: function(stream) {
      var path = NODEFS.realPath(stream.node);
      try {
        if (FS.isFile(stream.node.mode)) {
          stream.nfd = fs.openSync(path, NODEFS.flagsToPermissionString(stream.flags));
        }
      } catch (e) {
        if (!e.code) throw e;
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
    },
    close: function(stream) {
      try {
        if (FS.isFile(stream.node.mode) && stream.nfd) {
          fs.closeSync(stream.nfd);
        }
      } catch (e) {
        if (!e.code) throw e;
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
    },
    read: function(stream, buffer, offset, length, position) {
      if (length === 0) return 0;
      var nbuffer = new Buffer(length);
      var res;
      try {
        res = fs.readSync(stream.nfd, nbuffer, 0, length, position);
      } catch (e) {
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
      if (res > 0) {
        for (var i = 0; i < res; i++) {
          buffer[offset + i] = nbuffer[i];
        }
      }
      return res;
    },
    write: function(stream, buffer, offset, length, position) {
      var nbuffer = new Buffer(buffer.subarray(offset, offset + length));
      var res;
      try {
        res = fs.writeSync(stream.nfd, nbuffer, 0, length, position);
      } catch (e) {
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
      return res;
    },
    llseek: function(stream, offset, whence) {
      var position = offset;
      if (whence === 1) {
        position += stream.position;
      } else if (whence === 2) {
        if (FS.isFile(stream.node.mode)) {
          try {
            var stat = fs.fstatSync(stream.nfd);
            position += stat.size;
          } catch (e) {
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        }
      }
      if (position < 0) {
        throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
      }
      return position;
    }
  }
};
var _stdin = allocate(1, 'i32*', ALLOC_STATIC);
var _stdout = allocate(1, 'i32*', ALLOC_STATIC);
var _stderr = allocate(1, 'i32*', ALLOC_STATIC);
var FS = {
  root: null,
  mounts: [],
  devices: [null],
  streams: [],
  nextInode: 1,
  nameTable: null,
  currentPath: '/',
  initialized: false,
  ignorePermissions: true,
  trackingDelegate: {},
  tracking: {openFlags: {READ: 1, WRITE: 2}},
  ErrnoError: null,
  genericErrors: {},
  handleFSError: function(e) {
    if (!(e instanceof FS.ErrnoError)) throw e + ' : ' + stackTrace();
    return ___setErrNo(e.errno);
  },
  lookupPath: function(path, opts) {
    path = PATH.resolve(FS.cwd(), path);
    opts = opts || {};
    if (!path) return {path: '', node: null};
    var defaults = {follow_mount: true, recurse_count: 0};
    for (var key in defaults) {
      if (opts[key] === undefined) {
        opts[key] = defaults[key];
      }
    }
    if (opts.recurse_count > 8) {
      throw new FS.ErrnoError(ERRNO_CODES.ELOOP);
    }
    var parts = PATH.normalizeArray(
      path.split('/').filter(function(p) {
        return !!p;
      }),
      false
    );
    var current = FS.root;
    var current_path = '/';
    for (var i = 0; i < parts.length; i++) {
      var islast = i === parts.length - 1;
      if (islast && opts.parent) {
        break;
      }
      current = FS.lookupNode(current, parts[i]);
      current_path = PATH.join2(current_path, parts[i]);
      if (FS.isMountpoint(current)) {
        if (!islast || (islast && opts.follow_mount)) {
          current = current.mounted.root;
        }
      }
      if (!islast || opts.follow) {
        var count = 0;
        while (FS.isLink(current.mode)) {
          var link = FS.readlink(current_path);
          current_path = PATH.resolve(PATH.dirname(current_path), link);
          var lookup = FS.lookupPath(current_path, {recurse_count: opts.recurse_count});
          current = lookup.node;
          if (count++ > 40) {
            throw new FS.ErrnoError(ERRNO_CODES.ELOOP);
          }
        }
      }
    }
    return {path: current_path, node: current};
  },
  getPath: function(node) {
    var path;
    while (true) {
      if (FS.isRoot(node)) {
        var mount = node.mount.mountpoint;
        if (!path) return mount;
        return mount[mount.length - 1] !== '/' ? mount + '/' + path : mount + path;
      }
      path = path ? node.name + '/' + path : node.name;
      node = node.parent;
    }
  },
  hashName: function(parentid, name) {
    var hash = 0;
    for (var i = 0; i < name.length; i++) {
      hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    }
    return ((parentid + hash) >>> 0) % FS.nameTable.length;
  },
  hashAddNode: function(node) {
    var hash = FS.hashName(node.parent.id, node.name);
    node.name_next = FS.nameTable[hash];
    FS.nameTable[hash] = node;
  },
  hashRemoveNode: function(node) {
    var hash = FS.hashName(node.parent.id, node.name);
    if (FS.nameTable[hash] === node) {
      FS.nameTable[hash] = node.name_next;
    } else {
      var current = FS.nameTable[hash];
      while (current) {
        if (current.name_next === node) {
          current.name_next = node.name_next;
          break;
        }
        current = current.name_next;
      }
    }
  },
  lookupNode: function(parent, name) {
    var err = FS.mayLookup(parent);
    if (err) {
      throw new FS.ErrnoError(err, parent);
    }
    var hash = FS.hashName(parent.id, name);
    for (var node = FS.nameTable[hash]; node; node = node.name_next) {
      var nodeName = node.name;
      if (node.parent.id === parent.id && nodeName === name) {
        return node;
      }
    }
    return FS.lookup(parent, name);
  },
  createNode: function(parent, name, mode, rdev) {
    if (!FS.FSNode) {
      FS.FSNode = function(parent, name, mode, rdev) {
        if (!parent) {
          parent = this;
        }
        this.parent = parent;
        this.mount = parent.mount;
        this.mounted = null;
        this.id = FS.nextInode++;
        this.name = name;
        this.mode = mode;
        this.node_ops = {};
        this.stream_ops = {};
        this.rdev = rdev;
      };
      FS.FSNode.prototype = {};
      var readMode = 292 | 73;
      var writeMode = 146;
      Object.defineProperties(FS.FSNode.prototype, {
        read: {
          get: function() {
            return (this.mode & readMode) === readMode;
          },
          set: function(val) {
            val ? (this.mode |= readMode) : (this.mode &= ~readMode);
          }
        },
        write: {
          get: function() {
            return (this.mode & writeMode) === writeMode;
          },
          set: function(val) {
            val ? (this.mode |= writeMode) : (this.mode &= ~writeMode);
          }
        },
        isFolder: {
          get: function() {
            return FS.isDir(this.mode);
          }
        },
        isDevice: {
          get: function() {
            return FS.isChrdev(this.mode);
          }
        }
      });
    }
    var node = new FS.FSNode(parent, name, mode, rdev);
    FS.hashAddNode(node);
    return node;
  },
  destroyNode: function(node) {
    FS.hashRemoveNode(node);
  },
  isRoot: function(node) {
    return node === node.parent;
  },
  isMountpoint: function(node) {
    return !!node.mounted;
  },
  isFile: function(mode) {
    return (mode & 61440) === 32768;
  },
  isDir: function(mode) {
    return (mode & 61440) === 16384;
  },
  isLink: function(mode) {
    return (mode & 61440) === 40960;
  },
  isChrdev: function(mode) {
    return (mode & 61440) === 8192;
  },
  isBlkdev: function(mode) {
    return (mode & 61440) === 24576;
  },
  isFIFO: function(mode) {
    return (mode & 61440) === 4096;
  },
  isSocket: function(mode) {
    return (mode & 49152) === 49152;
  },
  flagModes: {
    r: 0,
    rs: 1052672,
    'r+': 2,
    w: 577,
    wx: 705,
    xw: 705,
    'w+': 578,
    'wx+': 706,
    'xw+': 706,
    a: 1089,
    ax: 1217,
    xa: 1217,
    'a+': 1090,
    'ax+': 1218,
    'xa+': 1218
  },
  modeStringToFlags: function(str) {
    var flags = FS.flagModes[str];
    if (typeof flags === 'undefined') {
      throw new Error('Unknown file open mode: ' + str);
    }
    return flags;
  },
  flagsToPermissionString: function(flag) {
    var accmode = flag & 2097155;
    var perms = ['r', 'w', 'rw'][accmode];
    if (flag & 512) {
      perms += 'w';
    }
    return perms;
  },
  nodePermissions: function(node, perms) {
    if (FS.ignorePermissions) {
      return 0;
    }
    if (perms.indexOf('r') !== -1 && !(node.mode & 292)) {
      return ERRNO_CODES.EACCES;
    } else if (perms.indexOf('w') !== -1 && !(node.mode & 146)) {
      return ERRNO_CODES.EACCES;
    } else if (perms.indexOf('x') !== -1 && !(node.mode & 73)) {
      return ERRNO_CODES.EACCES;
    }
    return 0;
  },
  mayLookup: function(dir) {
    var err = FS.nodePermissions(dir, 'x');
    if (err) return err;
    if (!dir.node_ops.lookup) return ERRNO_CODES.EACCES;
    return 0;
  },
  mayCreate: function(dir, name) {
    try {
      var node = FS.lookupNode(dir, name);
      return ERRNO_CODES.EEXIST;
    } catch (e) {}
    return FS.nodePermissions(dir, 'wx');
  },
  mayDelete: function(dir, name, isdir) {
    var node;
    try {
      node = FS.lookupNode(dir, name);
    } catch (e) {
      return e.errno;
    }
    var err = FS.nodePermissions(dir, 'wx');
    if (err) {
      return err;
    }
    if (isdir) {
      if (!FS.isDir(node.mode)) {
        return ERRNO_CODES.ENOTDIR;
      }
      if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
        return ERRNO_CODES.EBUSY;
      }
    } else {
      if (FS.isDir(node.mode)) {
        return ERRNO_CODES.EISDIR;
      }
    }
    return 0;
  },
  mayOpen: function(node, flags) {
    if (!node) {
      return ERRNO_CODES.ENOENT;
    }
    if (FS.isLink(node.mode)) {
      return ERRNO_CODES.ELOOP;
    } else if (FS.isDir(node.mode)) {
      if ((flags & 2097155) !== 0 || flags & 512) {
        return ERRNO_CODES.EISDIR;
      }
    }
    return FS.nodePermissions(node, FS.flagsToPermissionString(flags));
  },
  MAX_OPEN_FDS: 4096,
  nextfd: function(fd_start, fd_end) {
    fd_start = fd_start || 0;
    fd_end = fd_end || FS.MAX_OPEN_FDS;
    for (var fd = fd_start; fd <= fd_end; fd++) {
      if (!FS.streams[fd]) {
        return fd;
      }
    }
    throw new FS.ErrnoError(ERRNO_CODES.EMFILE);
  },
  getStream: function(fd) {
    return FS.streams[fd];
  },
  createStream: function(stream, fd_start, fd_end) {
    if (!FS.FSStream) {
      FS.FSStream = function() {};
      FS.FSStream.prototype = {};
      Object.defineProperties(FS.FSStream.prototype, {
        object: {
          get: function() {
            return this.node;
          },
          set: function(val) {
            this.node = val;
          }
        },
        isRead: {
          get: function() {
            return (this.flags & 2097155) !== 1;
          }
        },
        isWrite: {
          get: function() {
            return (this.flags & 2097155) !== 0;
          }
        },
        isAppend: {
          get: function() {
            return this.flags & 1024;
          }
        }
      });
    }
    var newStream = new FS.FSStream();
    for (var p in stream) {
      newStream[p] = stream[p];
    }
    stream = newStream;
    var fd = FS.nextfd(fd_start, fd_end);
    stream.fd = fd;
    FS.streams[fd] = stream;
    return stream;
  },
  closeStream: function(fd) {
    FS.streams[fd] = null;
  },
  getStreamFromPtr: function(ptr) {
    return FS.streams[ptr - 1];
  },
  getPtrForStream: function(stream) {
    return stream ? stream.fd + 1 : 0;
  },
  chrdev_stream_ops: {
    open: function(stream) {
      var device = FS.getDevice(stream.node.rdev);
      stream.stream_ops = device.stream_ops;
      if (stream.stream_ops.open) {
        stream.stream_ops.open(stream);
      }
    },
    llseek: function() {
      throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
    }
  },
  major: function(dev) {
    return dev >> 8;
  },
  minor: function(dev) {
    return dev & 255;
  },
  makedev: function(ma, mi) {
    return (ma << 8) | mi;
  },
  registerDevice: function(dev, ops) {
    FS.devices[dev] = {stream_ops: ops};
  },
  getDevice: function(dev) {
    return FS.devices[dev];
  },
  getMounts: function(mount) {
    var mounts = [];
    var check = [mount];
    while (check.length) {
      var m = check.pop();
      mounts.push(m);
      check.push.apply(check, m.mounts);
    }
    return mounts;
  },
  syncfs: function(populate, callback) {
    if (typeof populate === 'function') {
      callback = populate;
      populate = false;
    }
    var mounts = FS.getMounts(FS.root.mount);
    var completed = 0;
    function done(err) {
      if (err) {
        if (!done.errored) {
          done.errored = true;
          return callback(err);
        }
        return;
      }
      if (++completed >= mounts.length) {
        callback(null);
      }
    }
    mounts.forEach(function(mount) {
      if (!mount.type.syncfs) {
        return done(null);
      }
      mount.type.syncfs(mount, populate, done);
    });
  },
  mount: function(type, opts, mountpoint) {
    var root = mountpoint === '/';
    var pseudo = !mountpoint;
    var node;
    if (root && FS.root) {
      throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
    } else if (!root && !pseudo) {
      var lookup = FS.lookupPath(mountpoint, {follow_mount: false});
      mountpoint = lookup.path;
      node = lookup.node;
      if (FS.isMountpoint(node)) {
        throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
      }
      if (!FS.isDir(node.mode)) {
        throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
      }
    }
    var mount = {type: type, opts: opts, mountpoint: mountpoint, mounts: []};
    var mountRoot = type.mount(mount);
    mountRoot.mount = mount;
    mount.root = mountRoot;
    if (root) {
      FS.root = mountRoot;
    } else if (node) {
      node.mounted = mount;
      if (node.mount) {
        node.mount.mounts.push(mount);
      }
    }
    return mountRoot;
  },
  unmount: function(mountpoint) {
    var lookup = FS.lookupPath(mountpoint, {follow_mount: false});
    if (!FS.isMountpoint(lookup.node)) {
      throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
    }
    var node = lookup.node;
    var mount = node.mounted;
    var mounts = FS.getMounts(mount);
    Object.keys(FS.nameTable).forEach(function(hash) {
      var current = FS.nameTable[hash];
      while (current) {
        var next = current.name_next;
        if (mounts.indexOf(current.mount) !== -1) {
          FS.destroyNode(current);
        }
        current = next;
      }
    });
    node.mounted = null;
    var idx = node.mount.mounts.indexOf(mount);
    assert(idx !== -1);
    node.mount.mounts.splice(idx, 1);
  },
  lookup: function(parent, name) {
    return parent.node_ops.lookup(parent, name);
  },
  mknod: function(path, mode, dev) {
    var lookup = FS.lookupPath(path, {parent: true});
    var parent = lookup.node;
    var name = PATH.basename(path);
    if (!name || name === '.' || name === '..') {
      throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
    }
    var err = FS.mayCreate(parent, name);
    if (err) {
      throw new FS.ErrnoError(err);
    }
    if (!parent.node_ops.mknod) {
      throw new FS.ErrnoError(ERRNO_CODES.EPERM);
    }
    return parent.node_ops.mknod(parent, name, mode, dev);
  },
  create: function(path, mode) {
    mode = mode !== undefined ? mode : 438;
    mode &= 4095;
    mode |= 32768;
    return FS.mknod(path, mode, 0);
  },
  mkdir: function(path, mode) {
    mode = mode !== undefined ? mode : 511;
    mode &= 511 | 512;
    mode |= 16384;
    return FS.mknod(path, mode, 0);
  },
  mkdev: function(path, mode, dev) {
    if (typeof dev === 'undefined') {
      dev = mode;
      mode = 438;
    }
    mode |= 8192;
    return FS.mknod(path, mode, dev);
  },
  symlink: function(oldpath, newpath) {
    if (!PATH.resolve(oldpath)) {
      throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
    }
    var lookup = FS.lookupPath(newpath, {parent: true});
    var parent = lookup.node;
    if (!parent) {
      throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
    }
    var newname = PATH.basename(newpath);
    var err = FS.mayCreate(parent, newname);
    if (err) {
      throw new FS.ErrnoError(err);
    }
    if (!parent.node_ops.symlink) {
      throw new FS.ErrnoError(ERRNO_CODES.EPERM);
    }
    return parent.node_ops.symlink(parent, newname, oldpath);
  },
  rename: function(old_path, new_path) {
    var old_dirname = PATH.dirname(old_path);
    var new_dirname = PATH.dirname(new_path);
    var old_name = PATH.basename(old_path);
    var new_name = PATH.basename(new_path);
    var lookup, old_dir, new_dir;
    try {
      lookup = FS.lookupPath(old_path, {parent: true});
      old_dir = lookup.node;
      lookup = FS.lookupPath(new_path, {parent: true});
      new_dir = lookup.node;
    } catch (e) {
      throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
    }
    if (!old_dir || !new_dir) throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
    if (old_dir.mount !== new_dir.mount) {
      throw new FS.ErrnoError(ERRNO_CODES.EXDEV);
    }
    var old_node = FS.lookupNode(old_dir, old_name);
    var relative = PATH.relative(old_path, new_dirname);
    if (relative.charAt(0) !== '.') {
      throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
    }
    relative = PATH.relative(new_path, old_dirname);
    if (relative.charAt(0) !== '.') {
      throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
    }
    var new_node;
    try {
      new_node = FS.lookupNode(new_dir, new_name);
    } catch (e) {}
    if (old_node === new_node) {
      return;
    }
    var isdir = FS.isDir(old_node.mode);
    var err = FS.mayDelete(old_dir, old_name, isdir);
    if (err) {
      throw new FS.ErrnoError(err);
    }
    err = new_node ? FS.mayDelete(new_dir, new_name, isdir) : FS.mayCreate(new_dir, new_name);
    if (err) {
      throw new FS.ErrnoError(err);
    }
    if (!old_dir.node_ops.rename) {
      throw new FS.ErrnoError(ERRNO_CODES.EPERM);
    }
    if (FS.isMountpoint(old_node) || (new_node && FS.isMountpoint(new_node))) {
      throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
    }
    if (new_dir !== old_dir) {
      err = FS.nodePermissions(old_dir, 'w');
      if (err) {
        throw new FS.ErrnoError(err);
      }
    }
    try {
      if (FS.trackingDelegate['willMovePath']) {
        FS.trackingDelegate['willMovePath'](old_path, new_path);
      }
    } catch (e) {
      console.log(
        "FS.trackingDelegate['willMovePath']('" +
          old_path +
          "', '" +
          new_path +
          "') threw an exception: " +
          e.message
      );
    }
    FS.hashRemoveNode(old_node);
    try {
      old_dir.node_ops.rename(old_node, new_dir, new_name);
    } catch (e) {
      throw e;
    } finally {
      FS.hashAddNode(old_node);
    }
    try {
      if (FS.trackingDelegate['onMovePath']) FS.trackingDelegate['onMovePath'](old_path, new_path);
    } catch (e) {
      console.log(
        "FS.trackingDelegate['onMovePath']('" +
          old_path +
          "', '" +
          new_path +
          "') threw an exception: " +
          e.message
      );
    }
  },
  rmdir: function(path) {
    var lookup = FS.lookupPath(path, {parent: true});
    var parent = lookup.node;
    var name = PATH.basename(path);
    var node = FS.lookupNode(parent, name);
    var err = FS.mayDelete(parent, name, true);
    if (err) {
      throw new FS.ErrnoError(err);
    }
    if (!parent.node_ops.rmdir) {
      throw new FS.ErrnoError(ERRNO_CODES.EPERM);
    }
    if (FS.isMountpoint(node)) {
      throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
    }
    try {
      if (FS.trackingDelegate['willDeletePath']) {
        FS.trackingDelegate['willDeletePath'](path);
      }
    } catch (e) {
      console.log(
        "FS.trackingDelegate['willDeletePath']('" + path + "') threw an exception: " + e.message
      );
    }
    parent.node_ops.rmdir(parent, name);
    FS.destroyNode(node);
    try {
      if (FS.trackingDelegate['onDeletePath']) FS.trackingDelegate['onDeletePath'](path);
    } catch (e) {
      console.log(
        "FS.trackingDelegate['onDeletePath']('" + path + "') threw an exception: " + e.message
      );
    }
  },
  readdir: function(path) {
    var lookup = FS.lookupPath(path, {follow: true});
    var node = lookup.node;
    if (!node.node_ops.readdir) {
      throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
    }
    return node.node_ops.readdir(node);
  },
  unlink: function(path) {
    var lookup = FS.lookupPath(path, {parent: true});
    var parent = lookup.node;
    var name = PATH.basename(path);
    var node = FS.lookupNode(parent, name);
    var err = FS.mayDelete(parent, name, false);
    if (err) {
      if (err === ERRNO_CODES.EISDIR) err = ERRNO_CODES.EPERM;
      throw new FS.ErrnoError(err);
    }
    if (!parent.node_ops.unlink) {
      throw new FS.ErrnoError(ERRNO_CODES.EPERM);
    }
    if (FS.isMountpoint(node)) {
      throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
    }
    try {
      if (FS.trackingDelegate['willDeletePath']) {
        FS.trackingDelegate['willDeletePath'](path);
      }
    } catch (e) {
      console.log(
        "FS.trackingDelegate['willDeletePath']('" + path + "') threw an exception: " + e.message
      );
    }
    parent.node_ops.unlink(parent, name);
    FS.destroyNode(node);
    try {
      if (FS.trackingDelegate['onDeletePath']) FS.trackingDelegate['onDeletePath'](path);
    } catch (e) {
      console.log(
        "FS.trackingDelegate['onDeletePath']('" + path + "') threw an exception: " + e.message
      );
    }
  },
  readlink: function(path) {
    var lookup = FS.lookupPath(path);
    var link = lookup.node;
    if (!link) {
      throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
    }
    if (!link.node_ops.readlink) {
      throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
    }
    return link.node_ops.readlink(link);
  },
  stat: function(path, dontFollow) {
    var lookup = FS.lookupPath(path, {follow: !dontFollow});
    var node = lookup.node;
    if (!node) {
      throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
    }
    if (!node.node_ops.getattr) {
      throw new FS.ErrnoError(ERRNO_CODES.EPERM);
    }
    return node.node_ops.getattr(node);
  },
  lstat: function(path) {
    return FS.stat(path, true);
  },
  chmod: function(path, mode, dontFollow) {
    var node;
    if (typeof path === 'string') {
      var lookup = FS.lookupPath(path, {follow: !dontFollow});
      node = lookup.node;
    } else {
      node = path;
    }
    if (!node.node_ops.setattr) {
      throw new FS.ErrnoError(ERRNO_CODES.EPERM);
    }
    node.node_ops.setattr(node, {mode: (mode & 4095) | (node.mode & ~4095), timestamp: Date.now()});
  },
  lchmod: function(path, mode) {
    FS.chmod(path, mode, true);
  },
  fchmod: function(fd, mode) {
    var stream = FS.getStream(fd);
    if (!stream) {
      throw new FS.ErrnoError(ERRNO_CODES.EBADF);
    }
    FS.chmod(stream.node, mode);
  },
  chown: function(path, uid, gid, dontFollow) {
    var node;
    if (typeof path === 'string') {
      var lookup = FS.lookupPath(path, {follow: !dontFollow});
      node = lookup.node;
    } else {
      node = path;
    }
    if (!node.node_ops.setattr) {
      throw new FS.ErrnoError(ERRNO_CODES.EPERM);
    }
    node.node_ops.setattr(node, {timestamp: Date.now()});
  },
  lchown: function(path, uid, gid) {
    FS.chown(path, uid, gid, true);
  },
  fchown: function(fd, uid, gid) {
    var stream = FS.getStream(fd);
    if (!stream) {
      throw new FS.ErrnoError(ERRNO_CODES.EBADF);
    }
    FS.chown(stream.node, uid, gid);
  },
  truncate: function(path, len) {
    if (len < 0) {
      throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
    }
    var node;
    if (typeof path === 'string') {
      var lookup = FS.lookupPath(path, {follow: true});
      node = lookup.node;
    } else {
      node = path;
    }
    if (!node.node_ops.setattr) {
      throw new FS.ErrnoError(ERRNO_CODES.EPERM);
    }
    if (FS.isDir(node.mode)) {
      throw new FS.ErrnoError(ERRNO_CODES.EISDIR);
    }
    if (!FS.isFile(node.mode)) {
      throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
    }
    var err = FS.nodePermissions(node, 'w');
    if (err) {
      throw new FS.ErrnoError(err);
    }
    node.node_ops.setattr(node, {size: len, timestamp: Date.now()});
  },
  ftruncate: function(fd, len) {
    var stream = FS.getStream(fd);
    if (!stream) {
      throw new FS.ErrnoError(ERRNO_CODES.EBADF);
    }
    if ((stream.flags & 2097155) === 0) {
      throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
    }
    FS.truncate(stream.node, len);
  },
  utime: function(path, atime, mtime) {
    var lookup = FS.lookupPath(path, {follow: true});
    var node = lookup.node;
    node.node_ops.setattr(node, {timestamp: Math.max(atime, mtime)});
  },
  open: function(path, flags, mode, fd_start, fd_end) {
    if (path === '') {
      throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
    }
    flags = typeof flags === 'string' ? FS.modeStringToFlags(flags) : flags;
    mode = typeof mode === 'undefined' ? 438 : mode;
    if (flags & 64) {
      mode = (mode & 4095) | 32768;
    } else {
      mode = 0;
    }
    var node;
    if (typeof path === 'object') {
      node = path;
    } else {
      path = PATH.normalize(path);
      try {
        var lookup = FS.lookupPath(path, {follow: !(flags & 131072)});
        node = lookup.node;
      } catch (e) {}
    }
    var created = false;
    if (flags & 64) {
      if (node) {
        if (flags & 128) {
          throw new FS.ErrnoError(ERRNO_CODES.EEXIST);
        }
      } else {
        node = FS.mknod(path, mode, 0);
        created = true;
      }
    }
    if (!node) {
      throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
    }
    if (FS.isChrdev(node.mode)) {
      flags &= ~512;
    }
    if (!created) {
      var err = FS.mayOpen(node, flags);
      if (err) {
        throw new FS.ErrnoError(err);
      }
    }
    if (flags & 512) {
      FS.truncate(node, 0);
    }
    flags &= ~(128 | 512);
    var stream = FS.createStream(
      {
        node: node,
        path: FS.getPath(node),
        flags: flags,
        seekable: true,
        position: 0,
        stream_ops: node.stream_ops,
        ungotten: [],
        error: false
      },
      fd_start,
      fd_end
    );
    if (stream.stream_ops.open) {
      stream.stream_ops.open(stream);
    }
    if (Module['logReadFiles'] && !(flags & 1)) {
      if (!FS.readFiles) FS.readFiles = {};
      if (!(path in FS.readFiles)) {
        FS.readFiles[path] = 1;
        Module['printErr']('read file: ' + path);
      }
    }
    try {
      if (FS.trackingDelegate['onOpenFile']) {
        var trackingFlags = 0;
        if ((flags & 2097155) !== 1) {
          trackingFlags |= FS.tracking.openFlags.READ;
        }
        if ((flags & 2097155) !== 0) {
          trackingFlags |= FS.tracking.openFlags.WRITE;
        }
        FS.trackingDelegate['onOpenFile'](path, trackingFlags);
      }
    } catch (e) {
      console.log(
        "FS.trackingDelegate['onOpenFile']('" + path + "', flags) threw an exception: " + e.message
      );
    }
    return stream;
  },
  close: function(stream) {
    try {
      if (stream.stream_ops.close) {
        stream.stream_ops.close(stream);
      }
    } catch (e) {
      throw e;
    } finally {
      FS.closeStream(stream.fd);
    }
  },
  llseek: function(stream, offset, whence) {
    if (!stream.seekable || !stream.stream_ops.llseek) {
      throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
    }
    stream.position = stream.stream_ops.llseek(stream, offset, whence);
    stream.ungotten = [];
    return stream.position;
  },
  read: function(stream, buffer, offset, length, position) {
    if (length < 0 || position < 0) {
      throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
    }
    if ((stream.flags & 2097155) === 1) {
      throw new FS.ErrnoError(ERRNO_CODES.EBADF);
    }
    if (FS.isDir(stream.node.mode)) {
      throw new FS.ErrnoError(ERRNO_CODES.EISDIR);
    }
    if (!stream.stream_ops.read) {
      throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
    }
    var seeking = true;
    if (typeof position === 'undefined') {
      position = stream.position;
      seeking = false;
    } else if (!stream.seekable) {
      throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
    }
    var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
    if (!seeking) stream.position += bytesRead;
    return bytesRead;
  },
  write: function(stream, buffer, offset, length, position, canOwn) {
    if (length < 0 || position < 0) {
      throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
    }
    if ((stream.flags & 2097155) === 0) {
      throw new FS.ErrnoError(ERRNO_CODES.EBADF);
    }
    if (FS.isDir(stream.node.mode)) {
      throw new FS.ErrnoError(ERRNO_CODES.EISDIR);
    }
    if (!stream.stream_ops.write) {
      throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
    }
    if (stream.flags & 1024) {
      FS.llseek(stream, 0, 2);
    }
    var seeking = true;
    if (typeof position === 'undefined') {
      position = stream.position;
      seeking = false;
    } else if (!stream.seekable) {
      throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
    }
    var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
    if (!seeking) stream.position += bytesWritten;
    try {
      if (stream.path && FS.trackingDelegate['onWriteToFile'])
        FS.trackingDelegate['onWriteToFile'](stream.path);
    } catch (e) {
      console.log(
        "FS.trackingDelegate['onWriteToFile']('" + path + "') threw an exception: " + e.message
      );
    }
    return bytesWritten;
  },
  allocate: function(stream, offset, length) {
    if (offset < 0 || length <= 0) {
      throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
    }
    if ((stream.flags & 2097155) === 0) {
      throw new FS.ErrnoError(ERRNO_CODES.EBADF);
    }
    if (!FS.isFile(stream.node.mode) && !FS.isDir(node.mode)) {
      throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
    }
    if (!stream.stream_ops.allocate) {
      throw new FS.ErrnoError(ERRNO_CODES.EOPNOTSUPP);
    }
    stream.stream_ops.allocate(stream, offset, length);
  },
  mmap: function(stream, buffer, offset, length, position, prot, flags) {
    if ((stream.flags & 2097155) === 1) {
      throw new FS.ErrnoError(ERRNO_CODES.EACCES);
    }
    if (!stream.stream_ops.mmap) {
      throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
    }
    return stream.stream_ops.mmap(stream, buffer, offset, length, position, prot, flags);
  },
  ioctl: function(stream, cmd, arg) {
    if (!stream.stream_ops.ioctl) {
      throw new FS.ErrnoError(ERRNO_CODES.ENOTTY);
    }
    return stream.stream_ops.ioctl(stream, cmd, arg);
  },
  readFile: function(path, opts) {
    opts = opts || {};
    opts.flags = opts.flags || 'r';
    opts.encoding = opts.encoding || 'binary';
    if (opts.encoding !== 'utf8' && opts.encoding !== 'binary') {
      throw new Error('Invalid encoding type "' + opts.encoding + '"');
    }
    var ret;
    var stream = FS.open(path, opts.flags);
    var stat = FS.stat(path);
    var length = stat.size;
    var buf = new Uint8Array(length);
    FS.read(stream, buf, 0, length, 0);
    if (opts.encoding === 'utf8') {
      ret = '';
      var utf8 = new Runtime.UTF8Processor();
      for (var i = 0; i < length; i++) {
        ret += utf8.processCChar(buf[i]);
      }
    } else if (opts.encoding === 'binary') {
      ret = buf;
    }
    FS.close(stream);
    return ret;
  },
  writeFile: function(path, data, opts) {
    opts = opts || {};
    opts.flags = opts.flags || 'w';
    opts.encoding = opts.encoding || 'utf8';
    if (opts.encoding !== 'utf8' && opts.encoding !== 'binary') {
      throw new Error('Invalid encoding type "' + opts.encoding + '"');
    }
    var stream = FS.open(path, opts.flags, opts.mode);
    if (opts.encoding === 'utf8') {
      var utf8 = new Runtime.UTF8Processor();
      var buf = new Uint8Array(utf8.processJSString(data));
      FS.write(stream, buf, 0, buf.length, 0, opts.canOwn);
    } else if (opts.encoding === 'binary') {
      FS.write(stream, data, 0, data.length, 0, opts.canOwn);
    }
    FS.close(stream);
  },
  cwd: function() {
    return FS.currentPath;
  },
  chdir: function(path) {
    var lookup = FS.lookupPath(path, {follow: true});
    if (!FS.isDir(lookup.node.mode)) {
      throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
    }
    var err = FS.nodePermissions(lookup.node, 'x');
    if (err) {
      throw new FS.ErrnoError(err);
    }
    FS.currentPath = lookup.path;
  },
  createDefaultDirectories: function() {
    FS.mkdir('/tmp');
    FS.mkdir('/home');
    FS.mkdir('/home/web_user');
  },
  createDefaultDevices: function() {
    FS.mkdir('/dev');
    FS.registerDevice(FS.makedev(1, 3), {
      read: function() {
        return 0;
      },
      write: function() {
        return 0;
      }
    });
    FS.mkdev('/dev/null', FS.makedev(1, 3));
    TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
    TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
    FS.mkdev('/dev/tty', FS.makedev(5, 0));
    FS.mkdev('/dev/tty1', FS.makedev(6, 0));
    var random_device;
    if (typeof crypto !== 'undefined') {
      var randomBuffer = new Uint8Array(1);
      random_device = function() {
        crypto.getRandomValues(randomBuffer);
        return randomBuffer[0];
      };
    } else if (ENVIRONMENT_IS_NODE) {
      random_device = function() {
        return require('crypto').randomBytes(1)[0];
      };
    } else {
      random_device = function() {
        return (Math.random() * 256) | 0;
      };
    }
    FS.createDevice('/dev', 'random', random_device);
    FS.createDevice('/dev', 'urandom', random_device);
    FS.mkdir('/dev/shm');
    FS.mkdir('/dev/shm/tmp');
  },
  createStandardStreams: function() {
    if (Module['stdin']) {
      FS.createDevice('/dev', 'stdin', Module['stdin']);
    } else {
      FS.symlink('/dev/tty', '/dev/stdin');
    }
    if (Module['stdout']) {
      FS.createDevice('/dev', 'stdout', null, Module['stdout']);
    } else {
      FS.symlink('/dev/tty', '/dev/stdout');
    }
    if (Module['stderr']) {
      FS.createDevice('/dev', 'stderr', null, Module['stderr']);
    } else {
      FS.symlink('/dev/tty1', '/dev/stderr');
    }
    var stdin = FS.open('/dev/stdin', 'r');
    HEAP32[_stdin >> 2] = FS.getPtrForStream(stdin);
    assert(stdin.fd === 0, 'invalid handle for stdin (' + stdin.fd + ')');
    var stdout = FS.open('/dev/stdout', 'w');
    HEAP32[_stdout >> 2] = FS.getPtrForStream(stdout);
    assert(stdout.fd === 1, 'invalid handle for stdout (' + stdout.fd + ')');
    var stderr = FS.open('/dev/stderr', 'w');
    HEAP32[_stderr >> 2] = FS.getPtrForStream(stderr);
    assert(stderr.fd === 2, 'invalid handle for stderr (' + stderr.fd + ')');
  },
  ensureErrnoError: function() {
    if (FS.ErrnoError) return;
    FS.ErrnoError = function ErrnoError(errno, node) {
      this.node = node;
      this.setErrno = function(errno) {
        this.errno = errno;
        for (var key in ERRNO_CODES) {
          if (ERRNO_CODES[key] === errno) {
            this.code = key;
            break;
          }
        }
      };
      this.setErrno(errno);
      this.message = ERRNO_MESSAGES[errno];
    };
    FS.ErrnoError.prototype = new Error();
    FS.ErrnoError.prototype.constructor = FS.ErrnoError;
    [ERRNO_CODES.ENOENT].forEach(function(code) {
      FS.genericErrors[code] = new FS.ErrnoError(code);
      FS.genericErrors[code].stack = '<generic error, no stack>';
    });
  },
  staticInit: function() {
    FS.ensureErrnoError();
    FS.nameTable = new Array(4096);
    FS.mount(MEMFS, {}, '/');
    FS.createDefaultDirectories();
    FS.createDefaultDevices();
  },
  init: function(input, output, error) {
    assert(
      !FS.init.initialized,
      'FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)'
    );
    FS.init.initialized = true;
    FS.ensureErrnoError();
    Module['stdin'] = input || Module['stdin'];
    Module['stdout'] = output || Module['stdout'];
    Module['stderr'] = error || Module['stderr'];
    FS.createStandardStreams();
  },
  quit: function() {
    FS.init.initialized = false;
    for (var i = 0; i < FS.streams.length; i++) {
      var stream = FS.streams[i];
      if (!stream) {
        continue;
      }
      FS.close(stream);
    }
  },
  getMode: function(canRead, canWrite) {
    var mode = 0;
    if (canRead) mode |= 292 | 73;
    if (canWrite) mode |= 146;
    return mode;
  },
  joinPath: function(parts, forceRelative) {
    var path = PATH.join.apply(null, parts);
    if (forceRelative && path[0] == '/') path = path.substr(1);
    return path;
  },
  absolutePath: function(relative, base) {
    return PATH.resolve(base, relative);
  },
  standardizePath: function(path) {
    return PATH.normalize(path);
  },
  findObject: function(path, dontResolveLastLink) {
    var ret = FS.analyzePath(path, dontResolveLastLink);
    if (ret.exists) {
      return ret.object;
    } else {
      ___setErrNo(ret.error);
      return null;
    }
  },
  analyzePath: function(path, dontResolveLastLink) {
    try {
      var lookup = FS.lookupPath(path, {follow: !dontResolveLastLink});
      path = lookup.path;
    } catch (e) {}
    var ret = {
      isRoot: false,
      exists: false,
      error: 0,
      name: null,
      path: null,
      object: null,
      parentExists: false,
      parentPath: null,
      parentObject: null
    };
    try {
      var lookup = FS.lookupPath(path, {parent: true});
      ret.parentExists = true;
      ret.parentPath = lookup.path;
      ret.parentObject = lookup.node;
      ret.name = PATH.basename(path);
      lookup = FS.lookupPath(path, {follow: !dontResolveLastLink});
      ret.exists = true;
      ret.path = lookup.path;
      ret.object = lookup.node;
      ret.name = lookup.node.name;
      ret.isRoot = lookup.path === '/';
    } catch (e) {
      ret.error = e.errno;
    }
    return ret;
  },
  createFolder: function(parent, name, canRead, canWrite) {
    var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
    var mode = FS.getMode(canRead, canWrite);
    return FS.mkdir(path, mode);
  },
  createPath: function(parent, path, canRead, canWrite) {
    parent = typeof parent === 'string' ? parent : FS.getPath(parent);
    var parts = path.split('/').reverse();
    while (parts.length) {
      var part = parts.pop();
      if (!part) continue;
      var current = PATH.join2(parent, part);
      try {
        FS.mkdir(current);
      } catch (e) {}
      parent = current;
    }
    return current;
  },
  createFile: function(parent, name, properties, canRead, canWrite) {
    var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
    var mode = FS.getMode(canRead, canWrite);
    return FS.create(path, mode);
  },
  createDataFile: function(parent, name, data, canRead, canWrite, canOwn) {
    var path = name
      ? PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name)
      : parent;
    var mode = FS.getMode(canRead, canWrite);
    var node = FS.create(path, mode);
    if (data) {
      if (typeof data === 'string') {
        var arr = new Array(data.length);
        for (var i = 0, len = data.length; i < len; ++i) arr[i] = data.charCodeAt(i);
        data = arr;
      }
      FS.chmod(node, mode | 146);
      var stream = FS.open(node, 'w');
      FS.write(stream, data, 0, data.length, 0, canOwn);
      FS.close(stream);
      FS.chmod(node, mode);
    }
    return node;
  },
  createDevice: function(parent, name, input, output) {
    var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
    var mode = FS.getMode(!!input, !!output);
    if (!FS.createDevice.major) FS.createDevice.major = 64;
    var dev = FS.makedev(FS.createDevice.major++, 0);
    FS.registerDevice(dev, {
      open: function(stream) {
        stream.seekable = false;
      },
      close: function(stream) {
        if (output && output.buffer && output.buffer.length) {
          output(10);
        }
      },
      read: function(stream, buffer, offset, length, pos) {
        var bytesRead = 0;
        for (var i = 0; i < length; i++) {
          var result;
          try {
            result = input();
          } catch (e) {
            throw new FS.ErrnoError(ERRNO_CODES.EIO);
          }
          if (result === undefined && bytesRead === 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
          }
          if (result === null || result === undefined) break;
          bytesRead++;
          buffer[offset + i] = result;
        }
        if (bytesRead) {
          stream.node.timestamp = Date.now();
        }
        return bytesRead;
      },
      write: function(stream, buffer, offset, length, pos) {
        for (var i = 0; i < length; i++) {
          try {
            output(buffer[offset + i]);
          } catch (e) {
            throw new FS.ErrnoError(ERRNO_CODES.EIO);
          }
        }
        if (length) {
          stream.node.timestamp = Date.now();
        }
        return i;
      }
    });
    return FS.mkdev(path, mode, dev);
  },
  createLink: function(parent, name, target, canRead, canWrite) {
    var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
    return FS.symlink(target, path);
  },
  forceLoadFile: function(obj) {
    if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
    var success = true;
    if (typeof XMLHttpRequest !== 'undefined') {
      throw new Error(
        'Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.'
      );
    } else if (Module['read']) {
      try {
        obj.contents = intArrayFromString(Module['read'](obj.url), true);
        obj.usedBytes = obj.contents.length;
      } catch (e) {
        success = false;
      }
    } else {
      throw new Error('Cannot load without read() or XMLHttpRequest.');
    }
    if (!success) ___setErrNo(ERRNO_CODES.EIO);
    return success;
  },
  createLazyFile: function(parent, name, url, canRead, canWrite) {
    function LazyUint8Array() {
      this.lengthKnown = false;
      this.chunks = [];
    }
    LazyUint8Array.prototype.get = function LazyUint8Array_get(idx) {
      if (idx > this.length - 1 || idx < 0) {
        return undefined;
      }
      var chunkOffset = idx % this.chunkSize;
      var chunkNum = (idx / this.chunkSize) | 0;
      return this.getter(chunkNum)[chunkOffset];
    };
    LazyUint8Array.prototype.setDataGetter = function LazyUint8Array_setDataGetter(getter) {
      this.getter = getter;
    };
    LazyUint8Array.prototype.cacheLength = function LazyUint8Array_cacheLength() {
      var xhr = new XMLHttpRequest();
      xhr.open('HEAD', url, false);
      xhr.send(null);
      if (!((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304))
        throw new Error("Couldn't load " + url + '. Status: ' + xhr.status);
      var datalength = Number(xhr.getResponseHeader('Content-length'));
      var header;
      var hasByteServing = (header = xhr.getResponseHeader('Accept-Ranges')) && header === 'bytes';
      var chunkSize = 1024 * 1024;
      if (!hasByteServing) chunkSize = datalength;
      var doXHR = function(from, to) {
        if (from > to)
          throw new Error('invalid range (' + from + ', ' + to + ') or no bytes requested!');
        if (to > datalength - 1)
          throw new Error('only ' + datalength + ' bytes available! programmer error!');
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        if (datalength !== chunkSize) xhr.setRequestHeader('Range', 'bytes=' + from + '-' + to);
        if (typeof Uint8Array != 'undefined') xhr.responseType = 'arraybuffer';
        if (xhr.overrideMimeType) {
          xhr.overrideMimeType('text/plain; charset=x-user-defined');
        }
        xhr.send(null);
        if (!((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304))
          throw new Error("Couldn't load " + url + '. Status: ' + xhr.status);
        if (xhr.response !== undefined) {
          return new Uint8Array(xhr.response || []);
        } else {
          return intArrayFromString(xhr.responseText || '', true);
        }
      };
      var lazyArray = this;
      lazyArray.setDataGetter(function(chunkNum) {
        var start = chunkNum * chunkSize;
        var end = (chunkNum + 1) * chunkSize - 1;
        end = Math.min(end, datalength - 1);
        if (typeof lazyArray.chunks[chunkNum] === 'undefined') {
          lazyArray.chunks[chunkNum] = doXHR(start, end);
        }
        if (typeof lazyArray.chunks[chunkNum] === 'undefined') throw new Error('doXHR failed!');
        return lazyArray.chunks[chunkNum];
      });
      this._length = datalength;
      this._chunkSize = chunkSize;
      this.lengthKnown = true;
    };
    if (typeof XMLHttpRequest !== 'undefined') {
      if (!ENVIRONMENT_IS_WORKER)
        throw 'Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc';
      var lazyArray = new LazyUint8Array();
      Object.defineProperty(lazyArray, 'length', {
        get: function() {
          if (!this.lengthKnown) {
            this.cacheLength();
          }
          return this._length;
        }
      });
      Object.defineProperty(lazyArray, 'chunkSize', {
        get: function() {
          if (!this.lengthKnown) {
            this.cacheLength();
          }
          return this._chunkSize;
        }
      });
      var properties = {isDevice: false, contents: lazyArray};
    } else {
      var properties = {isDevice: false, url: url};
    }
    var node = FS.createFile(parent, name, properties, canRead, canWrite);
    if (properties.contents) {
      node.contents = properties.contents;
    } else if (properties.url) {
      node.contents = null;
      node.url = properties.url;
    }
    Object.defineProperty(node, 'usedBytes', {
      get: function() {
        return this.contents.length;
      }
    });
    var stream_ops = {};
    var keys = Object.keys(node.stream_ops);
    keys.forEach(function(key) {
      var fn = node.stream_ops[key];
      stream_ops[key] = function forceLoadLazyFile() {
        if (!FS.forceLoadFile(node)) {
          throw new FS.ErrnoError(ERRNO_CODES.EIO);
        }
        return fn.apply(null, arguments);
      };
    });
    stream_ops.read = function stream_ops_read(stream, buffer, offset, length, position) {
      if (!FS.forceLoadFile(node)) {
        throw new FS.ErrnoError(ERRNO_CODES.EIO);
      }
      var contents = stream.node.contents;
      if (position >= contents.length) return 0;
      var size = Math.min(contents.length - position, length);
      assert(size >= 0);
      if (contents.slice) {
        for (var i = 0; i < size; i++) {
          buffer[offset + i] = contents[position + i];
        }
      } else {
        for (var i = 0; i < size; i++) {
          buffer[offset + i] = contents.get(position + i);
        }
      }
      return size;
    };
    node.stream_ops = stream_ops;
    return node;
  },
  createPreloadedFile: function(
    parent,
    name,
    url,
    canRead,
    canWrite,
    onload,
    onerror,
    dontCreateFile,
    canOwn
  ) {
    Browser.init();
    var fullname = name ? PATH.resolve(PATH.join2(parent, name)) : parent;
    function processData(byteArray) {
      function finish(byteArray) {
        if (!dontCreateFile) {
          FS.createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);
        }
        if (onload) onload();
        removeRunDependency('cp ' + fullname);
      }
      var handled = false;
      Module['preloadPlugins'].forEach(function(plugin) {
        if (handled) return;
        if (plugin['canHandle'](fullname)) {
          plugin['handle'](byteArray, fullname, finish, function() {
            if (onerror) onerror();
            removeRunDependency('cp ' + fullname);
          });
          handled = true;
        }
      });
      if (!handled) finish(byteArray);
    }
    addRunDependency('cp ' + fullname);
    if (typeof url == 'string') {
      Browser.asyncLoad(
        url,
        function(byteArray) {
          processData(byteArray);
        },
        onerror
      );
    } else {
      processData(url);
    }
  },
  indexedDB: function() {
    return window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
  },
  DB_NAME: function() {
    return 'EM_FS_' + window.location.pathname;
  },
  DB_VERSION: 20,
  DB_STORE_NAME: 'FILE_DATA',
  saveFilesToDB: function(paths, onload, onerror) {
    onload = onload || function() {};
    onerror = onerror || function() {};
    var indexedDB = FS.indexedDB();
    try {
      var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
    } catch (e) {
      return onerror(e);
    }
    openRequest.onupgradeneeded = function openRequest_onupgradeneeded() {
      console.log('creating db');
      var db = openRequest.result;
      db.createObjectStore(FS.DB_STORE_NAME);
    };
    openRequest.onsuccess = function openRequest_onsuccess() {
      var db = openRequest.result;
      var transaction = db.transaction([FS.DB_STORE_NAME], 'readwrite');
      var files = transaction.objectStore(FS.DB_STORE_NAME);
      var ok = 0,
        fail = 0,
        total = paths.length;
      function finish() {
        if (fail == 0) onload();
        else onerror();
      }
      paths.forEach(function(path) {
        var putRequest = files.put(FS.analyzePath(path).object.contents, path);
        putRequest.onsuccess = function putRequest_onsuccess() {
          ok++;
          if (ok + fail == total) finish();
        };
        putRequest.onerror = function putRequest_onerror() {
          fail++;
          if (ok + fail == total) finish();
        };
      });
      transaction.onerror = onerror;
    };
    openRequest.onerror = onerror;
  },
  loadFilesFromDB: function(paths, onload, onerror) {
    onload = onload || function() {};
    onerror = onerror || function() {};
    var indexedDB = FS.indexedDB();
    try {
      var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
    } catch (e) {
      return onerror(e);
    }
    openRequest.onupgradeneeded = onerror;
    openRequest.onsuccess = function openRequest_onsuccess() {
      var db = openRequest.result;
      try {
        var transaction = db.transaction([FS.DB_STORE_NAME], 'readonly');
      } catch (e) {
        onerror(e);
        return;
      }
      var files = transaction.objectStore(FS.DB_STORE_NAME);
      var ok = 0,
        fail = 0,
        total = paths.length;
      function finish() {
        if (fail == 0) onload();
        else onerror();
      }
      paths.forEach(function(path) {
        var getRequest = files.get(path);
        getRequest.onsuccess = function getRequest_onsuccess() {
          if (FS.analyzePath(path).exists) {
            FS.unlink(path);
          }
          FS.createDataFile(
            PATH.dirname(path),
            PATH.basename(path),
            getRequest.result,
            true,
            true,
            true
          );
          ok++;
          if (ok + fail == total) finish();
        };
        getRequest.onerror = function getRequest_onerror() {
          fail++;
          if (ok + fail == total) finish();
        };
      });
      transaction.onerror = onerror;
    };
    openRequest.onerror = onerror;
  }
};
function _fflush(stream) {}
function _mkport() {
  throw 'TODO';
}
var SOCKFS = {
  mount: function(mount) {
    Module['websocket'] =
      Module['websocket'] && 'object' === typeof Module['websocket'] ? Module['websocket'] : {};
    Module['websocket']._callbacks = {};
    Module['websocket']['on'] = function(event, callback) {
      if ('function' === typeof callback) {
        this._callbacks[event] = callback;
      }
      return this;
    };
    Module['websocket'].emit = function(event, param) {
      if ('function' === typeof this._callbacks[event]) {
        this._callbacks[event].call(this, param);
      }
    };
    return FS.createNode(null, '/', 16384 | 511, 0);
  },
  createSocket: function(family, type, protocol) {
    var streaming = type == 1;
    if (protocol) {
      assert(streaming == (protocol == 6));
    }
    var sock = {
      family: family,
      type: type,
      protocol: protocol,
      server: null,
      error: null,
      peers: {},
      pending: [],
      recv_queue: [],
      sock_ops: SOCKFS.websocket_sock_ops
    };
    var name = SOCKFS.nextname();
    var node = FS.createNode(SOCKFS.root, name, 49152, 0);
    node.sock = sock;
    var stream = FS.createStream({
      path: name,
      node: node,
      flags: FS.modeStringToFlags('r+'),
      seekable: false,
      stream_ops: SOCKFS.stream_ops
    });
    sock.stream = stream;
    return sock;
  },
  getSocket: function(fd) {
    var stream = FS.getStream(fd);
    if (!stream || !FS.isSocket(stream.node.mode)) {
      return null;
    }
    return stream.node.sock;
  },
  stream_ops: {
    poll: function(stream) {
      var sock = stream.node.sock;
      return sock.sock_ops.poll(sock);
    },
    ioctl: function(stream, request, varargs) {
      var sock = stream.node.sock;
      return sock.sock_ops.ioctl(sock, request, varargs);
    },
    read: function(stream, buffer, offset, length, position) {
      var sock = stream.node.sock;
      var msg = sock.sock_ops.recvmsg(sock, length);
      if (!msg) {
        return 0;
      }
      buffer.set(msg.buffer, offset);
      return msg.buffer.length;
    },
    write: function(stream, buffer, offset, length, position) {
      var sock = stream.node.sock;
      return sock.sock_ops.sendmsg(sock, buffer, offset, length);
    },
    close: function(stream) {
      var sock = stream.node.sock;
      sock.sock_ops.close(sock);
    }
  },
  nextname: function() {
    if (!SOCKFS.nextname.current) {
      SOCKFS.nextname.current = 0;
    }
    return 'socket[' + SOCKFS.nextname.current++ + ']';
  },
  websocket_sock_ops: {
    createPeer: function(sock, addr, port) {
      var ws;
      if (typeof addr === 'object') {
        ws = addr;
        addr = null;
        port = null;
      }
      if (ws) {
        if (ws._socket) {
          addr = ws._socket.remoteAddress;
          port = ws._socket.remotePort;
        } else {
          var result = /ws[s]?:\/\/([^:]+):(\d+)/.exec(ws.url);
          if (!result) {
            throw new Error('WebSocket URL must be in the format ws(s)://address:port');
          }
          addr = result[1];
          port = parseInt(result[2], 10);
        }
      } else {
        try {
          var runtimeConfig = Module['websocket'] && 'object' === typeof Module['websocket'];
          var url = 'ws:#'.replace('#', '//');
          if (runtimeConfig) {
            if ('string' === typeof Module['websocket']['url']) {
              url = Module['websocket']['url'];
            }
          }
          if (url === 'ws://' || url === 'wss://') {
            var parts = addr.split('/');
            url = url + parts[0] + ':' + port + '/' + parts.slice(1).join('/');
          }
          var subProtocols = 'binary';
          if (runtimeConfig) {
            if ('string' === typeof Module['websocket']['subprotocol']) {
              subProtocols = Module['websocket']['subprotocol'];
            }
          }
          subProtocols = subProtocols.replace(/^ +| +$/g, '').split(/ *, */);
          var opts = ENVIRONMENT_IS_NODE ? {protocol: subProtocols.toString()} : subProtocols;
          var WebSocket = ENVIRONMENT_IS_NODE ? require('ws') : window['WebSocket'];
          ws = new WebSocket(url, opts);
          ws.binaryType = 'arraybuffer';
        } catch (e) {
          throw new FS.ErrnoError(ERRNO_CODES.EHOSTUNREACH);
        }
      }
      var peer = {addr: addr, port: port, socket: ws, dgram_send_queue: []};
      SOCKFS.websocket_sock_ops.addPeer(sock, peer);
      SOCKFS.websocket_sock_ops.handlePeerEvents(sock, peer);
      if (sock.type === 2 && typeof sock.sport !== 'undefined') {
        peer.dgram_send_queue.push(
          new Uint8Array([
            255,
            255,
            255,
            255,
            'p'.charCodeAt(0),
            'o'.charCodeAt(0),
            'r'.charCodeAt(0),
            't'.charCodeAt(0),
            (sock.sport & 65280) >> 8,
            sock.sport & 255
          ])
        );
      }
      return peer;
    },
    getPeer: function(sock, addr, port) {
      return sock.peers[addr + ':' + port];
    },
    addPeer: function(sock, peer) {
      sock.peers[peer.addr + ':' + peer.port] = peer;
    },
    removePeer: function(sock, peer) {
      delete sock.peers[peer.addr + ':' + peer.port];
    },
    handlePeerEvents: function(sock, peer) {
      var first = true;
      var handleOpen = function() {
        Module['websocket'].emit('open', sock.stream.fd);
        try {
          var queued = peer.dgram_send_queue.shift();
          while (queued) {
            peer.socket.send(queued);
            queued = peer.dgram_send_queue.shift();
          }
        } catch (e) {
          peer.socket.close();
        }
      };
      function handleMessage(data) {
        assert(typeof data !== 'string' && data.byteLength !== undefined);
        data = new Uint8Array(data);
        var wasfirst = first;
        first = false;
        if (
          wasfirst &&
          data.length === 10 &&
          data[0] === 255 &&
          data[1] === 255 &&
          data[2] === 255 &&
          data[3] === 255 &&
          data[4] === 'p'.charCodeAt(0) &&
          data[5] === 'o'.charCodeAt(0) &&
          data[6] === 'r'.charCodeAt(0) &&
          data[7] === 't'.charCodeAt(0)
        ) {
          var newport = (data[8] << 8) | data[9];
          SOCKFS.websocket_sock_ops.removePeer(sock, peer);
          peer.port = newport;
          SOCKFS.websocket_sock_ops.addPeer(sock, peer);
          return;
        }
        sock.recv_queue.push({addr: peer.addr, port: peer.port, data: data});
        Module['websocket'].emit('message', sock.stream.fd);
      }
      if (ENVIRONMENT_IS_NODE) {
        peer.socket.on('open', handleOpen);
        peer.socket.on('message', function(data, flags) {
          if (!flags.binary) {
            return;
          }
          handleMessage(new Uint8Array(data).buffer);
        });
        peer.socket.on('close', function() {
          Module['websocket'].emit('close', sock.stream.fd);
        });
        peer.socket.on('error', function(error) {
          sock.error = ERRNO_CODES.ECONNREFUSED;
          Module['websocket'].emit('error', [
            sock.stream.fd,
            sock.error,
            'ECONNREFUSED: Connection refused'
          ]);
        });
      } else {
        peer.socket.onopen = handleOpen;
        peer.socket.onclose = function() {
          Module['websocket'].emit('close', sock.stream.fd);
        };
        peer.socket.onmessage = function peer_socket_onmessage(event) {
          handleMessage(event.data);
        };
        peer.socket.onerror = function(error) {
          sock.error = ERRNO_CODES.ECONNREFUSED;
          Module['websocket'].emit('error', [
            sock.stream.fd,
            sock.error,
            'ECONNREFUSED: Connection refused'
          ]);
        };
      }
    },
    poll: function(sock) {
      if (sock.type === 1 && sock.server) {
        return sock.pending.length ? 64 | 1 : 0;
      }
      var mask = 0;
      var dest =
        sock.type === 1 ? SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport) : null;
      if (
        sock.recv_queue.length ||
        !dest ||
        (dest && dest.socket.readyState === dest.socket.CLOSING) ||
        (dest && dest.socket.readyState === dest.socket.CLOSED)
      ) {
        mask |= 64 | 1;
      }
      if (!dest || (dest && dest.socket.readyState === dest.socket.OPEN)) {
        mask |= 4;
      }
      if (
        (dest && dest.socket.readyState === dest.socket.CLOSING) ||
        (dest && dest.socket.readyState === dest.socket.CLOSED)
      ) {
        mask |= 16;
      }
      return mask;
    },
    ioctl: function(sock, request, arg) {
      switch (request) {
        case 21531:
          var bytes = 0;
          if (sock.recv_queue.length) {
            bytes = sock.recv_queue[0].data.length;
          }
          HEAP32[arg >> 2] = bytes;
          return 0;
        default:
          return ERRNO_CODES.EINVAL;
      }
    },
    close: function(sock) {
      if (sock.server) {
        try {
          sock.server.close();
        } catch (e) {}
        sock.server = null;
      }
      var peers = Object.keys(sock.peers);
      for (var i = 0; i < peers.length; i++) {
        var peer = sock.peers[peers[i]];
        try {
          peer.socket.close();
        } catch (e) {}
        SOCKFS.websocket_sock_ops.removePeer(sock, peer);
      }
      return 0;
    },
    bind: function(sock, addr, port) {
      if (typeof sock.saddr !== 'undefined' || typeof sock.sport !== 'undefined') {
        throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
      }
      sock.saddr = addr;
      sock.sport = port || _mkport();
      if (sock.type === 2) {
        if (sock.server) {
          sock.server.close();
          sock.server = null;
        }
        try {
          sock.sock_ops.listen(sock, 0);
        } catch (e) {
          if (!(e instanceof FS.ErrnoError)) throw e;
          if (e.errno !== ERRNO_CODES.EOPNOTSUPP) throw e;
        }
      }
    },
    connect: function(sock, addr, port) {
      if (sock.server) {
        throw new FS.ErrnoError(ERRNO_CODES.EOPNOTSUPP);
      }
      if (typeof sock.daddr !== 'undefined' && typeof sock.dport !== 'undefined') {
        var dest = SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport);
        if (dest) {
          if (dest.socket.readyState === dest.socket.CONNECTING) {
            throw new FS.ErrnoError(ERRNO_CODES.EALREADY);
          } else {
            throw new FS.ErrnoError(ERRNO_CODES.EISCONN);
          }
        }
      }
      var peer = SOCKFS.websocket_sock_ops.createPeer(sock, addr, port);
      sock.daddr = peer.addr;
      sock.dport = peer.port;
      throw new FS.ErrnoError(ERRNO_CODES.EINPROGRESS);
    },
    listen: function(sock, backlog) {
      if (!ENVIRONMENT_IS_NODE) {
        throw new FS.ErrnoError(ERRNO_CODES.EOPNOTSUPP);
      }
      if (sock.server) {
        throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
      }
      var WebSocketServer = require('ws').Server;
      var host = sock.saddr;
      sock.server = new WebSocketServer({host: host, port: sock.sport});
      Module['websocket'].emit('listen', sock.stream.fd);
      sock.server.on('connection', function(ws) {
        if (sock.type === 1) {
          var newsock = SOCKFS.createSocket(sock.family, sock.type, sock.protocol);
          var peer = SOCKFS.websocket_sock_ops.createPeer(newsock, ws);
          newsock.daddr = peer.addr;
          newsock.dport = peer.port;
          sock.pending.push(newsock);
          Module['websocket'].emit('connection', newsock.stream.fd);
        } else {
          SOCKFS.websocket_sock_ops.createPeer(sock, ws);
          Module['websocket'].emit('connection', sock.stream.fd);
        }
      });
      sock.server.on('closed', function() {
        Module['websocket'].emit('close', sock.stream.fd);
        sock.server = null;
      });
      sock.server.on('error', function(error) {
        sock.error = ERRNO_CODES.EHOSTUNREACH;
        Module['websocket'].emit('error', [
          sock.stream.fd,
          sock.error,
          'EHOSTUNREACH: Host is unreachable'
        ]);
      });
    },
    accept: function(listensock) {
      if (!listensock.server) {
        throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
      }
      var newsock = listensock.pending.shift();
      newsock.stream.flags = listensock.stream.flags;
      return newsock;
    },
    getname: function(sock, peer) {
      var addr, port;
      if (peer) {
        if (sock.daddr === undefined || sock.dport === undefined) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTCONN);
        }
        addr = sock.daddr;
        port = sock.dport;
      } else {
        addr = sock.saddr || 0;
        port = sock.sport || 0;
      }
      return {addr: addr, port: port};
    },
    sendmsg: function(sock, buffer, offset, length, addr, port) {
      if (sock.type === 2) {
        if (addr === undefined || port === undefined) {
          addr = sock.daddr;
          port = sock.dport;
        }
        if (addr === undefined || port === undefined) {
          throw new FS.ErrnoError(ERRNO_CODES.EDESTADDRREQ);
        }
      } else {
        addr = sock.daddr;
        port = sock.dport;
      }
      var dest = SOCKFS.websocket_sock_ops.getPeer(sock, addr, port);
      if (sock.type === 1) {
        if (
          !dest ||
          dest.socket.readyState === dest.socket.CLOSING ||
          dest.socket.readyState === dest.socket.CLOSED
        ) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTCONN);
        } else if (dest.socket.readyState === dest.socket.CONNECTING) {
          throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
        }
      }
      var data;
      if (buffer instanceof Array || buffer instanceof ArrayBuffer) {
        data = buffer.slice(offset, offset + length);
      } else {
        data = buffer.buffer.slice(buffer.byteOffset + offset, buffer.byteOffset + offset + length);
      }
      if (sock.type === 2) {
        if (!dest || dest.socket.readyState !== dest.socket.OPEN) {
          if (
            !dest ||
            dest.socket.readyState === dest.socket.CLOSING ||
            dest.socket.readyState === dest.socket.CLOSED
          ) {
            dest = SOCKFS.websocket_sock_ops.createPeer(sock, addr, port);
          }
          dest.dgram_send_queue.push(data);
          return length;
        }
      }
      try {
        dest.socket.send(data);
        return length;
      } catch (e) {
        throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
      }
    },
    recvmsg: function(sock, length) {
      if (sock.type === 1 && sock.server) {
        throw new FS.ErrnoError(ERRNO_CODES.ENOTCONN);
      }
      var queued = sock.recv_queue.shift();
      if (!queued) {
        if (sock.type === 1) {
          var dest = SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport);
          if (!dest) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOTCONN);
          } else if (
            dest.socket.readyState === dest.socket.CLOSING ||
            dest.socket.readyState === dest.socket.CLOSED
          ) {
            return null;
          } else {
            throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
          }
        } else {
          throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
        }
      }
      var queuedLength = queued.data.byteLength || queued.data.length;
      var queuedOffset = queued.data.byteOffset || 0;
      var queuedBuffer = queued.data.buffer || queued.data;
      var bytesRead = Math.min(length, queuedLength);
      var res = {
        buffer: new Uint8Array(queuedBuffer, queuedOffset, bytesRead),
        addr: queued.addr,
        port: queued.port
      };
      if (sock.type === 1 && bytesRead < queuedLength) {
        var bytesRemaining = queuedLength - bytesRead;
        queued.data = new Uint8Array(queuedBuffer, queuedOffset + bytesRead, bytesRemaining);
        sock.recv_queue.unshift(queued);
      }
      return res;
    }
  }
};
function _send(fd, buf, len, flags) {
  var sock = SOCKFS.getSocket(fd);
  if (!sock) {
    ___setErrNo(ERRNO_CODES.EBADF);
    return -1;
  }
  return _write(fd, buf, len);
}
function _pwrite(fildes, buf, nbyte, offset) {
  var stream = FS.getStream(fildes);
  if (!stream) {
    ___setErrNo(ERRNO_CODES.EBADF);
    return -1;
  }
  try {
    var slab = HEAP8;
    return FS.write(stream, slab, buf, nbyte, offset);
  } catch (e) {
    FS.handleFSError(e);
    return -1;
  }
}
function _write(fildes, buf, nbyte) {
  var stream = FS.getStream(fildes);
  if (!stream) {
    ___setErrNo(ERRNO_CODES.EBADF);
    return -1;
  }
  try {
    var slab = HEAP8;
    return FS.write(stream, slab, buf, nbyte);
  } catch (e) {
    FS.handleFSError(e);
    return -1;
  }
}
function _fileno(stream) {
  stream = FS.getStreamFromPtr(stream);
  if (!stream) return -1;
  return stream.fd;
}
function _fputc(c, stream) {
  var chr = unSign(c & 255);
  HEAP8[_fputc.ret >> 0] = chr;
  var fd = _fileno(stream);
  var ret = _write(fd, _fputc.ret, 1);
  if (ret == -1) {
    var streamObj = FS.getStreamFromPtr(stream);
    if (streamObj) streamObj.error = true;
    return -1;
  } else {
    return chr;
  }
}
function _sysconf(name) {
  switch (name) {
    case 30:
      return PAGE_SIZE;
    case 132:
    case 133:
    case 12:
    case 137:
    case 138:
    case 15:
    case 235:
    case 16:
    case 17:
    case 18:
    case 19:
    case 20:
    case 149:
    case 13:
    case 10:
    case 236:
    case 153:
    case 9:
    case 21:
    case 22:
    case 159:
    case 154:
    case 14:
    case 77:
    case 78:
    case 139:
    case 80:
    case 81:
    case 79:
    case 82:
    case 68:
    case 67:
    case 164:
    case 11:
    case 29:
    case 47:
    case 48:
    case 95:
    case 52:
    case 51:
    case 46:
      return 200809;
    case 27:
    case 246:
    case 127:
    case 128:
    case 23:
    case 24:
    case 160:
    case 161:
    case 181:
    case 182:
    case 242:
    case 183:
    case 184:
    case 243:
    case 244:
    case 245:
    case 165:
    case 178:
    case 179:
    case 49:
    case 50:
    case 168:
    case 169:
    case 175:
    case 170:
    case 171:
    case 172:
    case 97:
    case 76:
    case 32:
    case 173:
    case 35:
      return -1;
    case 176:
    case 177:
    case 7:
    case 155:
    case 8:
    case 157:
    case 125:
    case 126:
    case 92:
    case 93:
    case 129:
    case 130:
    case 131:
    case 94:
    case 91:
      return 1;
    case 74:
    case 60:
    case 69:
    case 70:
    case 4:
      return 1024;
    case 31:
    case 42:
    case 72:
      return 32;
    case 87:
    case 26:
    case 33:
      return 2147483647;
    case 34:
    case 1:
      return 47839;
    case 38:
    case 36:
      return 99;
    case 43:
    case 37:
      return 2048;
    case 0:
      return 2097152;
    case 3:
      return 65536;
    case 28:
      return 32768;
    case 44:
      return 32767;
    case 75:
      return 16384;
    case 39:
      return 1e3;
    case 89:
      return 700;
    case 71:
      return 256;
    case 40:
      return 255;
    case 2:
      return 100;
    case 180:
      return 64;
    case 25:
      return 20;
    case 5:
      return 16;
    case 6:
      return 6;
    case 73:
      return 4;
    case 84: {
      if (typeof navigator === 'object') return navigator['hardwareConcurrency'] || 1;
      return 1;
    }
  }
  ___setErrNo(ERRNO_CODES.EINVAL);
  return -1;
}
function _fwrite(ptr, size, nitems, stream) {
  var bytesToWrite = nitems * size;
  if (bytesToWrite == 0) return 0;
  var fd = _fileno(stream);
  var bytesWritten = _write(fd, ptr, bytesToWrite);
  if (bytesWritten == -1) {
    var streamObj = FS.getStreamFromPtr(stream);
    if (streamObj) streamObj.error = true;
    return 0;
  } else {
    return (bytesWritten / size) | 0;
  }
}
var emval_free_list = [];
var emval_handle_array = [{}, {value: undefined}, {value: null}, {value: true}, {value: false}];
function __emval_decref(handle) {
  if (handle > 4 && 0 === --emval_handle_array[handle].refcount) {
    emval_handle_array[handle] = undefined;
    emval_free_list.push(handle);
  }
}
function count_emval_handles() {
  var count = 0;
  for (var i = 5; i < emval_handle_array.length; ++i) {
    if (emval_handle_array[i] !== undefined) {
      ++count;
    }
  }
  return count;
}
function get_first_emval() {
  for (var i = 1; i < emval_handle_array.length; ++i) {
    if (emval_handle_array[i] !== undefined) {
      return emval_handle_array[i];
    }
  }
  return null;
}
function init_emval() {
  Module['count_emval_handles'] = count_emval_handles;
  Module['get_first_emval'] = get_first_emval;
}
function __emval_register(value) {
  switch (value) {
    case undefined: {
      return 1;
    }
    case null: {
      return 2;
    }
    case true: {
      return 3;
    }
    case false: {
      return 4;
    }
    default: {
      var handle = emval_free_list.length ? emval_free_list.pop() : emval_handle_array.length;
      emval_handle_array[handle] = {refcount: 1, value: value};
      return handle;
    }
  }
}
function __embind_register_emval(rawType, name) {
  name = readLatin1String(name);
  registerType(rawType, {
    name: name,
    fromWireType: function(handle) {
      var rv = emval_handle_array[handle].value;
      __emval_decref(handle);
      return rv;
    },
    toWireType: function(destructors, value) {
      return __emval_register(value);
    },
    argPackAdvance: 8,
    readValueFromPointer: simpleReadValueFromPointer,
    destructorFunction: null
  });
}
function ___gxx_personality_v0() {}
Module['_bitshift64Lshr'] = _bitshift64Lshr;
var _BDtoIHigh = true;
function _pthread_cond_broadcast() {
  return 0;
}
Module['_strlen'] = _strlen;
function __reallyNegative(x) {
  return x < 0 || (x === 0 && 1 / x === -Infinity);
}
function __formatString(format, varargs) {
  var textIndex = format;
  var argIndex = 0;
  function getNextArg(type) {
    var ret;
    if (type === 'double') {
      ret = ((HEAP32[tempDoublePtr >> 2] = HEAP32[(varargs + argIndex) >> 2]),
      (HEAP32[(tempDoublePtr + 4) >> 2] = HEAP32[(varargs + (argIndex + 4)) >> 2]),
      +HEAPF64[tempDoublePtr >> 3]);
    } else if (type == 'i64') {
      ret = [HEAP32[(varargs + argIndex) >> 2], HEAP32[(varargs + (argIndex + 4)) >> 2]];
    } else {
      type = 'i32';
      ret = HEAP32[(varargs + argIndex) >> 2];
    }
    argIndex += Runtime.getNativeFieldSize(type);
    return ret;
  }
  var ret = [];
  var curr, next, currArg;
  while (1) {
    var startTextIndex = textIndex;
    curr = HEAP8[textIndex >> 0];
    if (curr === 0) break;
    next = HEAP8[(textIndex + 1) >> 0];
    if (curr == 37) {
      var flagAlwaysSigned = false;
      var flagLeftAlign = false;
      var flagAlternative = false;
      var flagZeroPad = false;
      var flagPadSign = false;
      flagsLoop: while (1) {
        switch (next) {
          case 43:
            flagAlwaysSigned = true;
            break;
          case 45:
            flagLeftAlign = true;
            break;
          case 35:
            flagAlternative = true;
            break;
          case 48:
            if (flagZeroPad) {
              break flagsLoop;
            } else {
              flagZeroPad = true;
              break;
            }
          case 32:
            flagPadSign = true;
            break;
          default:
            break flagsLoop;
        }
        textIndex++;
        next = HEAP8[(textIndex + 1) >> 0];
      }
      var width = 0;
      if (next == 42) {
        width = getNextArg('i32');
        textIndex++;
        next = HEAP8[(textIndex + 1) >> 0];
      } else {
        while (next >= 48 && next <= 57) {
          width = width * 10 + (next - 48);
          textIndex++;
          next = HEAP8[(textIndex + 1) >> 0];
        }
      }
      var precisionSet = false,
        precision = -1;
      if (next == 46) {
        precision = 0;
        precisionSet = true;
        textIndex++;
        next = HEAP8[(textIndex + 1) >> 0];
        if (next == 42) {
          precision = getNextArg('i32');
          textIndex++;
        } else {
          while (1) {
            var precisionChr = HEAP8[(textIndex + 1) >> 0];
            if (precisionChr < 48 || precisionChr > 57) break;
            precision = precision * 10 + (precisionChr - 48);
            textIndex++;
          }
        }
        next = HEAP8[(textIndex + 1) >> 0];
      }
      if (precision < 0) {
        precision = 6;
        precisionSet = false;
      }
      var argSize;
      switch (String.fromCharCode(next)) {
        case 'h':
          var nextNext = HEAP8[(textIndex + 2) >> 0];
          if (nextNext == 104) {
            textIndex++;
            argSize = 1;
          } else {
            argSize = 2;
          }
          break;
        case 'l':
          var nextNext = HEAP8[(textIndex + 2) >> 0];
          if (nextNext == 108) {
            textIndex++;
            argSize = 8;
          } else {
            argSize = 4;
          }
          break;
        case 'L':
        case 'q':
        case 'j':
          argSize = 8;
          break;
        case 'z':
        case 't':
        case 'I':
          argSize = 4;
          break;
        default:
          argSize = null;
      }
      if (argSize) textIndex++;
      next = HEAP8[(textIndex + 1) >> 0];
      switch (String.fromCharCode(next)) {
        case 'd':
        case 'i':
        case 'u':
        case 'o':
        case 'x':
        case 'X':
        case 'p': {
          var signed = next == 100 || next == 105;
          argSize = argSize || 4;
          var currArg = getNextArg('i' + argSize * 8);
          var origArg = currArg;
          var argText;
          if (argSize == 8) {
            currArg = Runtime.makeBigInt(currArg[0], currArg[1], next == 117);
          }
          if (argSize <= 4) {
            var limit = Math.pow(256, argSize) - 1;
            currArg = (signed ? reSign : unSign)(currArg & limit, argSize * 8);
          }
          var currAbsArg = Math.abs(currArg);
          var prefix = '';
          if (next == 100 || next == 105) {
            if (argSize == 8 && i64Math) argText = i64Math.stringify(origArg[0], origArg[1], null);
            else argText = reSign(currArg, 8 * argSize, 1).toString(10);
          } else if (next == 117) {
            if (argSize == 8 && i64Math) argText = i64Math.stringify(origArg[0], origArg[1], true);
            else argText = unSign(currArg, 8 * argSize, 1).toString(10);
            currArg = Math.abs(currArg);
          } else if (next == 111) {
            argText = (flagAlternative ? '0' : '') + currAbsArg.toString(8);
          } else if (next == 120 || next == 88) {
            prefix = flagAlternative && currArg != 0 ? '0x' : '';
            if (argSize == 8 && i64Math) {
              if (origArg[1]) {
                argText = (origArg[1] >>> 0).toString(16);
                var lower = (origArg[0] >>> 0).toString(16);
                while (lower.length < 8) lower = '0' + lower;
                argText += lower;
              } else {
                argText = (origArg[0] >>> 0).toString(16);
              }
            } else if (currArg < 0) {
              currArg = -currArg;
              argText = (currAbsArg - 1).toString(16);
              var buffer = [];
              for (var i = 0; i < argText.length; i++) {
                buffer.push((15 - parseInt(argText[i], 16)).toString(16));
              }
              argText = buffer.join('');
              while (argText.length < argSize * 2) argText = 'f' + argText;
            } else {
              argText = currAbsArg.toString(16);
            }
            if (next == 88) {
              prefix = prefix.toUpperCase();
              argText = argText.toUpperCase();
            }
          } else if (next == 112) {
            if (currAbsArg === 0) {
              argText = '(nil)';
            } else {
              prefix = '0x';
              argText = currAbsArg.toString(16);
            }
          }
          if (precisionSet) {
            while (argText.length < precision) {
              argText = '0' + argText;
            }
          }
          if (currArg >= 0) {
            if (flagAlwaysSigned) {
              prefix = '+' + prefix;
            } else if (flagPadSign) {
              prefix = ' ' + prefix;
            }
          }
          if (argText.charAt(0) == '-') {
            prefix = '-' + prefix;
            argText = argText.substr(1);
          }
          while (prefix.length + argText.length < width) {
            if (flagLeftAlign) {
              argText += ' ';
            } else {
              if (flagZeroPad) {
                argText = '0' + argText;
              } else {
                prefix = ' ' + prefix;
              }
            }
          }
          argText = prefix + argText;
          argText.split('').forEach(function(chr) {
            ret.push(chr.charCodeAt(0));
          });
          break;
        }
        case 'f':
        case 'F':
        case 'e':
        case 'E':
        case 'g':
        case 'G': {
          var currArg = getNextArg('double');
          var argText;
          if (isNaN(currArg)) {
            argText = 'nan';
            flagZeroPad = false;
          } else if (!isFinite(currArg)) {
            argText = (currArg < 0 ? '-' : '') + 'inf';
            flagZeroPad = false;
          } else {
            var isGeneral = false;
            var effectivePrecision = Math.min(precision, 20);
            if (next == 103 || next == 71) {
              isGeneral = true;
              precision = precision || 1;
              var exponent = parseInt(currArg.toExponential(effectivePrecision).split('e')[1], 10);
              if (precision > exponent && exponent >= -4) {
                next = (next == 103 ? 'f' : 'F').charCodeAt(0);
                precision -= exponent + 1;
              } else {
                next = (next == 103 ? 'e' : 'E').charCodeAt(0);
                precision--;
              }
              effectivePrecision = Math.min(precision, 20);
            }
            if (next == 101 || next == 69) {
              argText = currArg.toExponential(effectivePrecision);
              if (/[eE][-+]\d$/.test(argText)) {
                argText = argText.slice(0, -1) + '0' + argText.slice(-1);
              }
            } else if (next == 102 || next == 70) {
              argText = currArg.toFixed(effectivePrecision);
              if (currArg === 0 && __reallyNegative(currArg)) {
                argText = '-' + argText;
              }
            }
            var parts = argText.split('e');
            if (isGeneral && !flagAlternative) {
              while (
                parts[0].length > 1 &&
                parts[0].indexOf('.') != -1 &&
                (parts[0].slice(-1) == '0' || parts[0].slice(-1) == '.')
              ) {
                parts[0] = parts[0].slice(0, -1);
              }
            } else {
              if (flagAlternative && argText.indexOf('.') == -1) parts[0] += '.';
              while (precision > effectivePrecision++) parts[0] += '0';
            }
            argText = parts[0] + (parts.length > 1 ? 'e' + parts[1] : '');
            if (next == 69) argText = argText.toUpperCase();
            if (currArg >= 0) {
              if (flagAlwaysSigned) {
                argText = '+' + argText;
              } else if (flagPadSign) {
                argText = ' ' + argText;
              }
            }
          }
          while (argText.length < width) {
            if (flagLeftAlign) {
              argText += ' ';
            } else {
              if (flagZeroPad && (argText[0] == '-' || argText[0] == '+')) {
                argText = argText[0] + '0' + argText.slice(1);
              } else {
                argText = (flagZeroPad ? '0' : ' ') + argText;
              }
            }
          }
          if (next < 97) argText = argText.toUpperCase();
          argText.split('').forEach(function(chr) {
            ret.push(chr.charCodeAt(0));
          });
          break;
        }
        case 's': {
          var arg = getNextArg('i8*');
          var argLength = arg ? _strlen(arg) : '(null)'.length;
          if (precisionSet) argLength = Math.min(argLength, precision);
          if (!flagLeftAlign) {
            while (argLength < width--) {
              ret.push(32);
            }
          }
          if (arg) {
            for (var i = 0; i < argLength; i++) {
              ret.push(HEAPU8[arg++ >> 0]);
            }
          } else {
            ret = ret.concat(intArrayFromString('(null)'.substr(0, argLength), true));
          }
          if (flagLeftAlign) {
            while (argLength < width--) {
              ret.push(32);
            }
          }
          break;
        }
        case 'c': {
          if (flagLeftAlign) ret.push(getNextArg('i8'));
          while (--width > 0) {
            ret.push(32);
          }
          if (!flagLeftAlign) ret.push(getNextArg('i8'));
          break;
        }
        case 'n': {
          var ptr = getNextArg('i32*');
          HEAP32[ptr >> 2] = ret.length;
          break;
        }
        case '%': {
          ret.push(curr);
          break;
        }
        default: {
          for (var i = startTextIndex; i < textIndex + 2; i++) {
            ret.push(HEAP8[i >> 0]);
          }
        }
      }
      textIndex += 2;
    } else {
      ret.push(curr);
      textIndex += 1;
    }
  }
  return ret;
}
function _fprintf(stream, format, varargs) {
  var result = __formatString(format, varargs);
  var stack = Runtime.stackSave();
  var ret = _fwrite(allocate(result, 'i8', ALLOC_STACK), 1, result.length, stream);
  Runtime.stackRestore(stack);
  return ret;
}
function _vfprintf(s, f, va_arg) {
  return _fprintf(s, f, HEAP32[va_arg >> 2]);
}
function _pthread_mutex_unlock() {}
function _emscripten_memcpy_big(dest, src, num) {
  HEAPU8.set(HEAPU8.subarray(src, src + num), dest);
  return dest;
}
Module['_memcpy'] = _memcpy;
function _sbrk(bytes) {
  var self = _sbrk;
  if (!self.called) {
    DYNAMICTOP = alignMemoryPage(DYNAMICTOP);
    self.called = true;
    assert(Runtime.dynamicAlloc);
    self.alloc = Runtime.dynamicAlloc;
    Runtime.dynamicAlloc = function() {
      abort('cannot dynamically allocate, sbrk now has control');
    };
  }
  var ret = DYNAMICTOP;
  if (bytes != 0) self.alloc(bytes);
  return ret;
}
Module['_bitshift64Shl'] = _bitshift64Shl;
var LOCALE = {
  curr: 0,
  check: function(locale) {
    if (locale) locale = Pointer_stringify(locale);
    return locale === 'C' || locale === 'POSIX' || !locale;
  }
};
function _calloc(n, s) {
  var ret = _malloc(n * s);
  _memset(ret, 0, n * s);
  return ret;
}
Module['_calloc'] = _calloc;
function _newlocale(mask, locale, base) {
  if (!LOCALE.check(locale)) {
    ___setErrNo(ERRNO_CODES.ENOENT);
    return 0;
  }
  if (!base) base = _calloc(1, 4);
  return base;
}
Module['_memmove'] = _memmove;
function ___errno_location() {
  return ___errno_state;
}
function _strerror_r(errnum, strerrbuf, buflen) {
  if (errnum in ERRNO_MESSAGES) {
    if (ERRNO_MESSAGES[errnum].length > buflen - 1) {
      return ___setErrNo(ERRNO_CODES.ERANGE);
    } else {
      var msg = ERRNO_MESSAGES[errnum];
      writeAsciiToMemory(msg, strerrbuf);
      return 0;
    }
  } else {
    return ___setErrNo(ERRNO_CODES.EINVAL);
  }
}
function _strerror(errnum) {
  if (!_strerror.buffer) _strerror.buffer = _malloc(256);
  _strerror_r(errnum, _strerror.buffer, 256);
  return _strerror.buffer;
}
function _pthread_mutex_destroy() {}
function _catclose(catd) {
  return 0;
}
function __embind_register_memory_view(rawType, dataTypeIndex, name) {
  var typeMapping = [
    Int8Array,
    Uint8Array,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array
  ];
  var TA = typeMapping[dataTypeIndex];
  function decodeMemoryView(handle) {
    handle = handle >> 2;
    var heap = HEAPU32;
    var size = heap[handle];
    var data = heap[handle + 1];
    return new TA(heap['buffer'], data, size);
  }
  name = readLatin1String(name);
  registerType(
    rawType,
    {
      name: name,
      fromWireType: decodeMemoryView,
      argPackAdvance: 8,
      readValueFromPointer: decodeMemoryView
    },
    {ignoreDuplicateRegistrations: true}
  );
}
function ___cxa_guard_release() {}
function _ungetc(c, stream) {
  stream = FS.getStreamFromPtr(stream);
  if (!stream) {
    return -1;
  }
  if (c === -1) {
    return c;
  }
  c = unSign(c & 255);
  stream.ungotten.push(c);
  stream.eof = false;
  return c;
}
function _uselocale(locale) {
  var old = LOCALE.curr;
  if (locale) LOCALE.curr = locale;
  return old;
}
function ___assert_fail(condition, filename, line, func) {
  ABORT = true;
  throw 'Assertion failed: ' +
    Pointer_stringify(condition) +
    ', at: ' +
    [
      filename ? Pointer_stringify(filename) : 'unknown filename',
      line,
      func ? Pointer_stringify(func) : 'unknown function'
    ] +
    ' at ' +
    stackTrace();
}
function __embind_register_void(rawType, name) {
  name = readLatin1String(name);
  registerType(rawType, {
    isVoid: true,
    name: name,
    argPackAdvance: 0,
    fromWireType: function() {
      return undefined;
    },
    toWireType: function(destructors, o) {
      return undefined;
    }
  });
}
Module['_memset'] = _memset;
var _BDtoILow = true;
var _BItoD = true;
function __isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
function __arraySum(array, index) {
  var sum = 0;
  for (var i = 0; i <= index; sum += array[i++]);
  return sum;
}
var __MONTH_DAYS_LEAP = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
var __MONTH_DAYS_REGULAR = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function __addDays(date, days) {
  var newDate = new Date(date.getTime());
  while (days > 0) {
    var leap = __isLeapYear(newDate.getFullYear());
    var currentMonth = newDate.getMonth();
    var daysInCurrentMonth = (leap ? __MONTH_DAYS_LEAP : __MONTH_DAYS_REGULAR)[currentMonth];
    if (days > daysInCurrentMonth - newDate.getDate()) {
      days -= daysInCurrentMonth - newDate.getDate() + 1;
      newDate.setDate(1);
      if (currentMonth < 11) {
        newDate.setMonth(currentMonth + 1);
      } else {
        newDate.setMonth(0);
        newDate.setFullYear(newDate.getFullYear() + 1);
      }
    } else {
      newDate.setDate(newDate.getDate() + days);
      return newDate;
    }
  }
  return newDate;
}
function _strftime(s, maxsize, format, tm) {
  var tm_zone = HEAP32[(tm + 40) >> 2];
  var date = {
    tm_sec: HEAP32[tm >> 2],
    tm_min: HEAP32[(tm + 4) >> 2],
    tm_hour: HEAP32[(tm + 8) >> 2],
    tm_mday: HEAP32[(tm + 12) >> 2],
    tm_mon: HEAP32[(tm + 16) >> 2],
    tm_year: HEAP32[(tm + 20) >> 2],
    tm_wday: HEAP32[(tm + 24) >> 2],
    tm_yday: HEAP32[(tm + 28) >> 2],
    tm_isdst: HEAP32[(tm + 32) >> 2],
    tm_gmtoff: HEAP32[(tm + 36) >> 2],
    tm_zone: tm_zone ? Pointer_stringify(tm_zone) : ''
  };
  var pattern = Pointer_stringify(format);
  var EXPANSION_RULES_1 = {
    '%c': '%a %b %d %H:%M:%S %Y',
    '%D': '%m/%d/%y',
    '%F': '%Y-%m-%d',
    '%h': '%b',
    '%r': '%I:%M:%S %p',
    '%R': '%H:%M',
    '%T': '%H:%M:%S',
    '%x': '%m/%d/%y',
    '%X': '%H:%M:%S'
  };
  for (var rule in EXPANSION_RULES_1) {
    pattern = pattern.replace(new RegExp(rule, 'g'), EXPANSION_RULES_1[rule]);
  }
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
  ];
  function leadingSomething(value, digits, character) {
    var str = typeof value === 'number' ? value.toString() : value || '';
    while (str.length < digits) {
      str = character[0] + str;
    }
    return str;
  }
  function leadingNulls(value, digits) {
    return leadingSomething(value, digits, '0');
  }
  function compareByDay(date1, date2) {
    function sgn(value) {
      return value < 0 ? -1 : value > 0 ? 1 : 0;
    }
    var compare;
    if ((compare = sgn(date1.getFullYear() - date2.getFullYear())) === 0) {
      if ((compare = sgn(date1.getMonth() - date2.getMonth())) === 0) {
        compare = sgn(date1.getDate() - date2.getDate());
      }
    }
    return compare;
  }
  function getFirstWeekStartDate(janFourth) {
    switch (janFourth.getDay()) {
      case 0:
        return new Date(janFourth.getFullYear() - 1, 11, 29);
      case 1:
        return janFourth;
      case 2:
        return new Date(janFourth.getFullYear(), 0, 3);
      case 3:
        return new Date(janFourth.getFullYear(), 0, 2);
      case 4:
        return new Date(janFourth.getFullYear(), 0, 1);
      case 5:
        return new Date(janFourth.getFullYear() - 1, 11, 31);
      case 6:
        return new Date(janFourth.getFullYear() - 1, 11, 30);
    }
  }
  function getWeekBasedYear(date) {
    var thisDate = __addDays(new Date(date.tm_year + 1900, 0, 1), date.tm_yday);
    var janFourthThisYear = new Date(thisDate.getFullYear(), 0, 4);
    var janFourthNextYear = new Date(thisDate.getFullYear() + 1, 0, 4);
    var firstWeekStartThisYear = getFirstWeekStartDate(janFourthThisYear);
    var firstWeekStartNextYear = getFirstWeekStartDate(janFourthNextYear);
    if (compareByDay(firstWeekStartThisYear, thisDate) <= 0) {
      if (compareByDay(firstWeekStartNextYear, thisDate) <= 0) {
        return thisDate.getFullYear() + 1;
      } else {
        return thisDate.getFullYear();
      }
    } else {
      return thisDate.getFullYear() - 1;
    }
  }
  var EXPANSION_RULES_2 = {
    '%a': function(date) {
      return WEEKDAYS[date.tm_wday].substring(0, 3);
    },
    '%A': function(date) {
      return WEEKDAYS[date.tm_wday];
    },
    '%b': function(date) {
      return MONTHS[date.tm_mon].substring(0, 3);
    },
    '%B': function(date) {
      return MONTHS[date.tm_mon];
    },
    '%C': function(date) {
      var year = date.tm_year + 1900;
      return leadingNulls((year / 100) | 0, 2);
    },
    '%d': function(date) {
      return leadingNulls(date.tm_mday, 2);
    },
    '%e': function(date) {
      return leadingSomething(date.tm_mday, 2, ' ');
    },
    '%g': function(date) {
      return getWeekBasedYear(date)
        .toString()
        .substring(2);
    },
    '%G': function(date) {
      return getWeekBasedYear(date);
    },
    '%H': function(date) {
      return leadingNulls(date.tm_hour, 2);
    },
    '%I': function(date) {
      return leadingNulls(date.tm_hour < 13 ? date.tm_hour : date.tm_hour - 12, 2);
    },
    '%j': function(date) {
      return leadingNulls(
        date.tm_mday +
          __arraySum(
            __isLeapYear(date.tm_year + 1900) ? __MONTH_DAYS_LEAP : __MONTH_DAYS_REGULAR,
            date.tm_mon - 1
          ),
        3
      );
    },
    '%m': function(date) {
      return leadingNulls(date.tm_mon + 1, 2);
    },
    '%M': function(date) {
      return leadingNulls(date.tm_min, 2);
    },
    '%n': function() {
      return '\n';
    },
    '%p': function(date) {
      if (date.tm_hour > 0 && date.tm_hour < 13) {
        return 'AM';
      } else {
        return 'PM';
      }
    },
    '%S': function(date) {
      return leadingNulls(date.tm_sec, 2);
    },
    '%t': function() {
      return '\t';
    },
    '%u': function(date) {
      var day = new Date(date.tm_year + 1900, date.tm_mon + 1, date.tm_mday, 0, 0, 0, 0);
      return day.getDay() || 7;
    },
    '%U': function(date) {
      var janFirst = new Date(date.tm_year + 1900, 0, 1);
      var firstSunday =
        janFirst.getDay() === 0 ? janFirst : __addDays(janFirst, 7 - janFirst.getDay());
      var endDate = new Date(date.tm_year + 1900, date.tm_mon, date.tm_mday);
      if (compareByDay(firstSunday, endDate) < 0) {
        var februaryFirstUntilEndMonth =
          __arraySum(
            __isLeapYear(endDate.getFullYear()) ? __MONTH_DAYS_LEAP : __MONTH_DAYS_REGULAR,
            endDate.getMonth() - 1
          ) - 31;
        var firstSundayUntilEndJanuary = 31 - firstSunday.getDate();
        var days = firstSundayUntilEndJanuary + februaryFirstUntilEndMonth + endDate.getDate();
        return leadingNulls(Math.ceil(days / 7), 2);
      }
      return compareByDay(firstSunday, janFirst) === 0 ? '01' : '00';
    },
    '%V': function(date) {
      var janFourthThisYear = new Date(date.tm_year + 1900, 0, 4);
      var janFourthNextYear = new Date(date.tm_year + 1901, 0, 4);
      var firstWeekStartThisYear = getFirstWeekStartDate(janFourthThisYear);
      var firstWeekStartNextYear = getFirstWeekStartDate(janFourthNextYear);
      var endDate = __addDays(new Date(date.tm_year + 1900, 0, 1), date.tm_yday);
      if (compareByDay(endDate, firstWeekStartThisYear) < 0) {
        return '53';
      }
      if (compareByDay(firstWeekStartNextYear, endDate) <= 0) {
        return '01';
      }
      var daysDifference;
      if (firstWeekStartThisYear.getFullYear() < date.tm_year + 1900) {
        daysDifference = date.tm_yday + 32 - firstWeekStartThisYear.getDate();
      } else {
        daysDifference = date.tm_yday + 1 - firstWeekStartThisYear.getDate();
      }
      return leadingNulls(Math.ceil(daysDifference / 7), 2);
    },
    '%w': function(date) {
      var day = new Date(date.tm_year + 1900, date.tm_mon + 1, date.tm_mday, 0, 0, 0, 0);
      return day.getDay();
    },
    '%W': function(date) {
      var janFirst = new Date(date.tm_year, 0, 1);
      var firstMonday =
        janFirst.getDay() === 1
          ? janFirst
          : __addDays(janFirst, janFirst.getDay() === 0 ? 1 : 7 - janFirst.getDay() + 1);
      var endDate = new Date(date.tm_year + 1900, date.tm_mon, date.tm_mday);
      if (compareByDay(firstMonday, endDate) < 0) {
        var februaryFirstUntilEndMonth =
          __arraySum(
            __isLeapYear(endDate.getFullYear()) ? __MONTH_DAYS_LEAP : __MONTH_DAYS_REGULAR,
            endDate.getMonth() - 1
          ) - 31;
        var firstMondayUntilEndJanuary = 31 - firstMonday.getDate();
        var days = firstMondayUntilEndJanuary + februaryFirstUntilEndMonth + endDate.getDate();
        return leadingNulls(Math.ceil(days / 7), 2);
      }
      return compareByDay(firstMonday, janFirst) === 0 ? '01' : '00';
    },
    '%y': function(date) {
      return (date.tm_year + 1900).toString().substring(2);
    },
    '%Y': function(date) {
      return date.tm_year + 1900;
    },
    '%z': function(date) {
      var off = date.tm_gmtoff;
      var ahead = off >= 0;
      off = Math.abs(off) / 60;
      off = (off / 60) * 100 + (off % 60);
      return (ahead ? '+' : '-') + String('0000' + off).slice(-4);
    },
    '%Z': function(date) {
      return date.tm_zone;
    },
    '%%': function() {
      return '%';
    }
  };
  for (var rule in EXPANSION_RULES_2) {
    if (pattern.indexOf(rule) >= 0) {
      pattern = pattern.replace(new RegExp(rule, 'g'), EXPANSION_RULES_2[rule](date));
    }
  }
  var bytes = intArrayFromString(pattern, false);
  if (bytes.length > maxsize) {
    return 0;
  }
  writeArrayToMemory(bytes, s);
  return bytes.length - 1;
}
function _strftime_l(s, maxsize, format, tm) {
  return _strftime(s, maxsize, format, tm);
}
function _abort() {
  Module['abort']();
}
function _pthread_once(ptr, func) {
  if (!_pthread_once.seen) _pthread_once.seen = {};
  if (ptr in _pthread_once.seen) return;
  Runtime.dynCall('v', func);
  _pthread_once.seen[ptr] = 1;
}
function ClassHandle_isAliasOf(other) {
  if (!(this instanceof ClassHandle)) {
    return false;
  }
  if (!(other instanceof ClassHandle)) {
    return false;
  }
  var leftClass = this.$$.ptrType.registeredClass;
  var left = this.$$.ptr;
  var rightClass = other.$$.ptrType.registeredClass;
  var right = other.$$.ptr;
  while (leftClass.baseClass) {
    left = leftClass.upcast(left);
    leftClass = leftClass.baseClass;
  }
  while (rightClass.baseClass) {
    right = rightClass.upcast(right);
    rightClass = rightClass.baseClass;
  }
  return leftClass === rightClass && left === right;
}
function shallowCopyInternalPointer(o) {
  return {
    count: o.count,
    deleteScheduled: o.deleteScheduled,
    preservePointerOnDelete: o.preservePointerOnDelete,
    ptr: o.ptr,
    ptrType: o.ptrType,
    smartPtr: o.smartPtr,
    smartPtrType: o.smartPtrType
  };
}
function throwInstanceAlreadyDeleted(obj) {
  function getInstanceTypeName(handle) {
    return handle.$$.ptrType.registeredClass.name;
  }
  throwBindingError(getInstanceTypeName(obj) + ' instance already deleted');
}
function ClassHandle_clone() {
  if (!this.$$.ptr) {
    throwInstanceAlreadyDeleted(this);
  }
  if (this.$$.preservePointerOnDelete) {
    this.$$.count.value += 1;
    return this;
  } else {
    var clone = Object.create(Object.getPrototypeOf(this), {
      $$: {value: shallowCopyInternalPointer(this.$$)}
    });
    clone.$$.count.value += 1;
    clone.$$.deleteScheduled = false;
    return clone;
  }
}
function runDestructor(handle) {
  var $$ = handle.$$;
  if ($$.smartPtr) {
    $$.smartPtrType.rawDestructor($$.smartPtr);
  } else {
    $$.ptrType.registeredClass.rawDestructor($$.ptr);
  }
}
function ClassHandle_delete() {
  if (!this.$$.ptr) {
    throwInstanceAlreadyDeleted(this);
  }
  if (this.$$.deleteScheduled && !this.$$.preservePointerOnDelete) {
    throwBindingError('Object already scheduled for deletion');
  }
  this.$$.count.value -= 1;
  var toDelete = 0 === this.$$.count.value;
  if (toDelete) {
    runDestructor(this);
  }
  if (!this.$$.preservePointerOnDelete) {
    this.$$.smartPtr = undefined;
    this.$$.ptr = undefined;
  }
}
function ClassHandle_isDeleted() {
  return !this.$$.ptr;
}
var delayFunction = undefined;
var deletionQueue = [];
function flushPendingDeletes() {
  while (deletionQueue.length) {
    var obj = deletionQueue.pop();
    obj.$$.deleteScheduled = false;
    obj['delete']();
  }
}
function ClassHandle_deleteLater() {
  if (!this.$$.ptr) {
    throwInstanceAlreadyDeleted(this);
  }
  if (this.$$.deleteScheduled && !this.$$.preservePointerOnDelete) {
    throwBindingError('Object already scheduled for deletion');
  }
  deletionQueue.push(this);
  if (deletionQueue.length === 1 && delayFunction) {
    delayFunction(flushPendingDeletes);
  }
  this.$$.deleteScheduled = true;
  return this;
}
function init_ClassHandle() {
  ClassHandle.prototype['isAliasOf'] = ClassHandle_isAliasOf;
  ClassHandle.prototype['clone'] = ClassHandle_clone;
  ClassHandle.prototype['delete'] = ClassHandle_delete;
  ClassHandle.prototype['isDeleted'] = ClassHandle_isDeleted;
  ClassHandle.prototype['deleteLater'] = ClassHandle_deleteLater;
}
function ClassHandle() {}
var registeredPointers = {};
function ensureOverloadTable(proto, methodName, humanName) {
  if (undefined === proto[methodName].overloadTable) {
    var prevFunc = proto[methodName];
    proto[methodName] = function() {
      if (!proto[methodName].overloadTable.hasOwnProperty(arguments.length)) {
        throwBindingError(
          "Function '" +
            humanName +
            "' called with an invalid number of arguments (" +
            arguments.length +
            ') - expects one of (' +
            proto[methodName].overloadTable +
            ')!'
        );
      }
      return proto[methodName].overloadTable[arguments.length].apply(this, arguments);
    };
    proto[methodName].overloadTable = [];
    proto[methodName].overloadTable[prevFunc.argCount] = prevFunc;
  }
}
function exposePublicSymbol(name, value, numArguments) {
  if (Module.hasOwnProperty(name)) {
    if (
      undefined === numArguments ||
      (undefined !== Module[name].overloadTable &&
        undefined !== Module[name].overloadTable[numArguments])
    ) {
      throwBindingError("Cannot register public name '" + name + "' twice");
    }
    ensureOverloadTable(Module, name, name);
    if (Module.hasOwnProperty(numArguments)) {
      throwBindingError(
        'Cannot register multiple overloads of a function with the same number of arguments (' +
          numArguments +
          ')!'
      );
    }
    Module[name].overloadTable[numArguments] = value;
  } else {
    Module[name] = value;
    if (undefined !== numArguments) {
      Module[name].numArguments = numArguments;
    }
  }
}
function RegisteredClass(
  name,
  constructor,
  instancePrototype,
  rawDestructor,
  baseClass,
  getActualType,
  upcast,
  downcast
) {
  this.name = name;
  this.constructor = constructor;
  this.instancePrototype = instancePrototype;
  this.rawDestructor = rawDestructor;
  this.baseClass = baseClass;
  this.getActualType = getActualType;
  this.upcast = upcast;
  this.downcast = downcast;
  this.pureVirtualFunctions = [];
}
function upcastPointer(ptr, ptrClass, desiredClass) {
  while (ptrClass !== desiredClass) {
    if (!ptrClass.upcast) {
      throwBindingError(
        'Expected null or instance of ' +
          desiredClass.name +
          ', got an instance of ' +
          ptrClass.name
      );
    }
    ptr = ptrClass.upcast(ptr);
    ptrClass = ptrClass.baseClass;
  }
  return ptr;
}
function constNoSmartPtrRawPointerToWireType(destructors, handle) {
  if (handle === null) {
    if (this.isReference) {
      throwBindingError('null is not a valid ' + this.name);
    }
    return 0;
  }
  if (!handle.$$) {
    throwBindingError('Cannot pass "' + _embind_repr(handle) + '" as a ' + this.name);
  }
  if (!handle.$$.ptr) {
    throwBindingError('Cannot pass deleted object as a pointer of type ' + this.name);
  }
  var handleClass = handle.$$.ptrType.registeredClass;
  var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
  return ptr;
}
function genericPointerToWireType(destructors, handle) {
  if (handle === null) {
    if (this.isReference) {
      throwBindingError('null is not a valid ' + this.name);
    }
    if (this.isSmartPointer) {
      var ptr = this.rawConstructor();
      if (destructors !== null) {
        destructors.push(this.rawDestructor, ptr);
      }
      return ptr;
    } else {
      return 0;
    }
  }
  if (!handle.$$) {
    throwBindingError('Cannot pass "' + _embind_repr(handle) + '" as a ' + this.name);
  }
  if (!handle.$$.ptr) {
    throwBindingError('Cannot pass deleted object as a pointer of type ' + this.name);
  }
  if (!this.isConst && handle.$$.ptrType.isConst) {
    throwBindingError(
      'Cannot convert argument of type ' +
        (handle.$$.smartPtrType ? handle.$$.smartPtrType.name : handle.$$.ptrType.name) +
        ' to parameter type ' +
        this.name
    );
  }
  var handleClass = handle.$$.ptrType.registeredClass;
  var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
  if (this.isSmartPointer) {
    if (undefined === handle.$$.smartPtr) {
      throwBindingError('Passing raw pointer to smart pointer is illegal');
    }
    switch (this.sharingPolicy) {
      case 0:
        if (handle.$$.smartPtrType === this) {
          ptr = handle.$$.smartPtr;
        } else {
          throwBindingError(
            'Cannot convert argument of type ' +
              (handle.$$.smartPtrType ? handle.$$.smartPtrType.name : handle.$$.ptrType.name) +
              ' to parameter type ' +
              this.name
          );
        }
        break;
      case 1:
        ptr = handle.$$.smartPtr;
        break;
      case 2:
        if (handle.$$.smartPtrType === this) {
          ptr = handle.$$.smartPtr;
        } else {
          var clonedHandle = handle['clone']();
          ptr = this.rawShare(
            ptr,
            __emval_register(function() {
              clonedHandle['delete']();
            })
          );
          if (destructors !== null) {
            destructors.push(this.rawDestructor, ptr);
          }
        }
        break;
      default:
        throwBindingError('Unsupporting sharing policy');
    }
  }
  return ptr;
}
function nonConstNoSmartPtrRawPointerToWireType(destructors, handle) {
  if (handle === null) {
    if (this.isReference) {
      throwBindingError('null is not a valid ' + this.name);
    }
    return 0;
  }
  if (!handle.$$) {
    throwBindingError('Cannot pass "' + _embind_repr(handle) + '" as a ' + this.name);
  }
  if (!handle.$$.ptr) {
    throwBindingError('Cannot pass deleted object as a pointer of type ' + this.name);
  }
  if (handle.$$.ptrType.isConst) {
    throwBindingError(
      'Cannot convert argument of type ' +
        handle.$$.ptrType.name +
        ' to parameter type ' +
        this.name
    );
  }
  var handleClass = handle.$$.ptrType.registeredClass;
  var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
  return ptr;
}
function RegisteredPointer_getPointee(ptr) {
  if (this.rawGetPointee) {
    ptr = this.rawGetPointee(ptr);
  }
  return ptr;
}
function RegisteredPointer_destructor(ptr) {
  if (this.rawDestructor) {
    this.rawDestructor(ptr);
  }
}
function RegisteredPointer_deleteObject(handle) {
  if (handle !== null) {
    handle['delete']();
  }
}
function downcastPointer(ptr, ptrClass, desiredClass) {
  if (ptrClass === desiredClass) {
    return ptr;
  }
  if (undefined === desiredClass.baseClass) {
    return null;
  }
  var rv = downcastPointer(ptr, ptrClass, desiredClass.baseClass);
  if (rv === null) {
    return null;
  }
  return desiredClass.downcast(rv);
}
function getInheritedInstanceCount() {
  return Object.keys(registeredInstances).length;
}
function getLiveInheritedInstances() {
  var rv = [];
  for (var k in registeredInstances) {
    if (registeredInstances.hasOwnProperty(k)) {
      rv.push(registeredInstances[k]);
    }
  }
  return rv;
}
function setDelayFunction(fn) {
  delayFunction = fn;
  if (deletionQueue.length && delayFunction) {
    delayFunction(flushPendingDeletes);
  }
}
function init_embind() {
  Module['getInheritedInstanceCount'] = getInheritedInstanceCount;
  Module['getLiveInheritedInstances'] = getLiveInheritedInstances;
  Module['flushPendingDeletes'] = flushPendingDeletes;
  Module['setDelayFunction'] = setDelayFunction;
}
var registeredInstances = {};
function getBasestPointer(class_, ptr) {
  if (ptr === undefined) {
    throwBindingError('ptr should not be undefined');
  }
  while (class_.baseClass) {
    ptr = class_.upcast(ptr);
    class_ = class_.baseClass;
  }
  return ptr;
}
function getInheritedInstance(class_, ptr) {
  ptr = getBasestPointer(class_, ptr);
  return registeredInstances[ptr];
}
var _throwInternalError = undefined;
function makeClassHandle(prototype, record) {
  if (!record.ptrType || !record.ptr) {
    throwInternalError('makeClassHandle requires ptr and ptrType');
  }
  var hasSmartPtrType = !!record.smartPtrType;
  var hasSmartPtr = !!record.smartPtr;
  if (hasSmartPtrType !== hasSmartPtr) {
    throwInternalError('Both smartPtrType and smartPtr must be specified');
  }
  record.count = {value: 1};
  return Object.create(prototype, {$$: {value: record}});
}
function RegisteredPointer_fromWireType(ptr) {
  var rawPointer = this.getPointee(ptr);
  if (!rawPointer) {
    this.destructor(ptr);
    return null;
  }
  var registeredInstance = getInheritedInstance(this.registeredClass, rawPointer);
  if (undefined !== registeredInstance) {
    if (0 === registeredInstance.$$.count.value) {
      registeredInstance.$$.ptr = rawPointer;
      registeredInstance.$$.smartPtr = ptr;
      return registeredInstance['clone']();
    } else {
      var rv = registeredInstance['clone']();
      this.destructor(ptr);
      return rv;
    }
  }
  function makeDefaultHandle() {
    if (this.isSmartPointer) {
      return makeClassHandle(this.registeredClass.instancePrototype, {
        ptrType: this.pointeeType,
        ptr: rawPointer,
        smartPtrType: this,
        smartPtr: ptr
      });
    } else {
      return makeClassHandle(this.registeredClass.instancePrototype, {ptrType: this, ptr: ptr});
    }
  }
  var actualType = this.registeredClass.getActualType(rawPointer);
  var registeredPointerRecord = registeredPointers[actualType];
  if (!registeredPointerRecord) {
    return makeDefaultHandle.call(this);
  }
  var toType;
  if (this.isConst) {
    toType = registeredPointerRecord.constPointerType;
  } else {
    toType = registeredPointerRecord.pointerType;
  }
  var dp = downcastPointer(rawPointer, this.registeredClass, toType.registeredClass);
  if (dp === null) {
    return makeDefaultHandle.call(this);
  }
  if (this.isSmartPointer) {
    return makeClassHandle(toType.registeredClass.instancePrototype, {
      ptrType: toType,
      ptr: dp,
      smartPtrType: this,
      smartPtr: ptr
    });
  } else {
    return makeClassHandle(toType.registeredClass.instancePrototype, {ptrType: toType, ptr: dp});
  }
}
function init_RegisteredPointer() {
  RegisteredPointer.prototype.getPointee = RegisteredPointer_getPointee;
  RegisteredPointer.prototype.destructor = RegisteredPointer_destructor;
  RegisteredPointer.prototype['argPackAdvance'] = 8;
  RegisteredPointer.prototype['readValueFromPointer'] = simpleReadValueFromPointer;
  RegisteredPointer.prototype['deleteObject'] = RegisteredPointer_deleteObject;
  RegisteredPointer.prototype['fromWireType'] = RegisteredPointer_fromWireType;
}
function RegisteredPointer(
  name,
  registeredClass,
  isReference,
  isConst,
  isSmartPointer,
  pointeeType,
  sharingPolicy,
  rawGetPointee,
  rawConstructor,
  rawShare,
  rawDestructor
) {
  this.name = name;
  this.registeredClass = registeredClass;
  this.isReference = isReference;
  this.isConst = isConst;
  this.isSmartPointer = isSmartPointer;
  this.pointeeType = pointeeType;
  this.sharingPolicy = sharingPolicy;
  this.rawGetPointee = rawGetPointee;
  this.rawConstructor = rawConstructor;
  this.rawShare = rawShare;
  this.rawDestructor = rawDestructor;
  if (!isSmartPointer && registeredClass.baseClass === undefined) {
    if (isConst) {
      this['toWireType'] = constNoSmartPtrRawPointerToWireType;
      this.destructorFunction = null;
    } else {
      this['toWireType'] = nonConstNoSmartPtrRawPointerToWireType;
      this.destructorFunction = null;
    }
  } else {
    this['toWireType'] = genericPointerToWireType;
  }
}
function replacePublicSymbol(name, value, numArguments) {
  if (!Module.hasOwnProperty(name)) {
    throwInternalError('Replacing nonexistant public symbol');
  }
  if (undefined !== Module[name].overloadTable && undefined !== numArguments) {
    Module[name].overloadTable[numArguments] = value;
  } else {
    Module[name] = value;
  }
}
function requireFunction(signature, rawFunction) {
  signature = readLatin1String(signature);
  function makeDynCaller(dynCall) {
    var args = [];
    for (var i = 1; i < signature.length; ++i) {
      args.push('a' + i);
    }
    var name = 'dynCall_' + signature + '_' + rawFunction;
    var body = 'return function ' + name + '(' + args.join(', ') + ') {\n';
    body += '    return dynCall(rawFunction' + (args.length ? ', ' : '') + args.join(', ') + ');\n';
    body += '};\n';
    return new Function('dynCall', 'rawFunction', body)(dynCall, rawFunction);
  }
  var fp;
  if (Module['FUNCTION_TABLE_' + signature] !== undefined) {
    fp = Module['FUNCTION_TABLE_' + signature][rawFunction];
  } else if (typeof FUNCTION_TABLE !== 'undefined') {
    fp = FUNCTION_TABLE[rawFunction];
  } else {
    var dc = asm['dynCall_' + signature];
    if (dc === undefined) {
      dc = asm['dynCall_' + signature.replace(/f/g, 'd')];
      if (dc === undefined) {
        throwBindingError('No dynCall invoker for signature: ' + signature);
      }
    }
    fp = makeDynCaller(dc);
  }
  if (typeof fp !== 'function') {
    throwBindingError('unknown function pointer with signature ' + signature + ': ' + rawFunction);
  }
  return fp;
}
var UnboundTypeError = undefined;
function throwUnboundTypeError(message, types) {
  var unboundTypes = [];
  var seen = {};
  function visit(type) {
    if (seen[type]) {
      return;
    }
    if (registeredTypes[type]) {
      return;
    }
    if (typeDependencies[type]) {
      typeDependencies[type].forEach(visit);
      return;
    }
    unboundTypes.push(type);
    seen[type] = true;
  }
  types.forEach(visit);
  throw new UnboundTypeError(message + ': ' + unboundTypes.map(getTypeName).join([', ']));
}
function __embind_register_class(
  rawType,
  rawPointerType,
  rawConstPointerType,
  baseClassRawType,
  getActualTypeSignature,
  getActualType,
  upcastSignature,
  upcast,
  downcastSignature,
  downcast,
  name,
  destructorSignature,
  rawDestructor
) {
  name = readLatin1String(name);
  getActualType = requireFunction(getActualTypeSignature, getActualType);
  if (upcast) {
    upcast = requireFunction(upcastSignature, upcast);
  }
  if (downcast) {
    downcast = requireFunction(downcastSignature, downcast);
  }
  rawDestructor = requireFunction(destructorSignature, rawDestructor);
  var legalFunctionName = makeLegalFunctionName(name);
  exposePublicSymbol(legalFunctionName, function() {
    throwUnboundTypeError('Cannot construct ' + name + ' due to unbound types', [baseClassRawType]);
  });
  whenDependentTypesAreResolved(
    [rawType, rawPointerType, rawConstPointerType],
    baseClassRawType ? [baseClassRawType] : [],
    function(base) {
      base = base[0];
      var baseClass;
      var basePrototype;
      if (baseClassRawType) {
        baseClass = base.registeredClass;
        basePrototype = baseClass.instancePrototype;
      } else {
        basePrototype = ClassHandle.prototype;
      }
      var constructor = createNamedFunction(legalFunctionName, function() {
        if (Object.getPrototypeOf(this) !== instancePrototype) {
          throw new BindingError("Use 'new' to construct " + name);
        }
        if (undefined === registeredClass.constructor_body) {
          throw new BindingError(name + ' has no accessible constructor');
        }
        var body = registeredClass.constructor_body[arguments.length];
        if (undefined === body) {
          throw new BindingError(
            'Tried to invoke ctor of ' +
              name +
              ' with invalid number of parameters (' +
              arguments.length +
              ') - expected (' +
              Object.keys(registeredClass.constructor_body).toString() +
              ') parameters instead!'
          );
        }
        return body.apply(this, arguments);
      });
      var instancePrototype = Object.create(basePrototype, {constructor: {value: constructor}});
      constructor.prototype = instancePrototype;
      var registeredClass = new RegisteredClass(
        name,
        constructor,
        instancePrototype,
        rawDestructor,
        baseClass,
        getActualType,
        upcast,
        downcast
      );
      var referenceConverter = new RegisteredPointer(name, registeredClass, true, false, false);
      var pointerConverter = new RegisteredPointer(
        name + '*',
        registeredClass,
        false,
        false,
        false
      );
      var constPointerConverter = new RegisteredPointer(
        name + ' const*',
        registeredClass,
        false,
        true,
        false
      );
      registeredPointers[rawType] = {
        pointerType: pointerConverter,
        constPointerType: constPointerConverter
      };
      replacePublicSymbol(legalFunctionName, constructor);
      return [referenceConverter, pointerConverter, constPointerConverter];
    }
  );
}
function _pthread_cond_wait() {
  return 0;
}
var PTHREAD_SPECIFIC = {};
function _pthread_getspecific(key) {
  return PTHREAD_SPECIFIC[key] || 0;
}
var _fabs = Math_abs;
function _recv(fd, buf, len, flags) {
  var sock = SOCKFS.getSocket(fd);
  if (!sock) {
    ___setErrNo(ERRNO_CODES.EBADF);
    return -1;
  }
  return _read(fd, buf, len);
}
function _pread(fildes, buf, nbyte, offset) {
  var stream = FS.getStream(fildes);
  if (!stream) {
    ___setErrNo(ERRNO_CODES.EBADF);
    return -1;
  }
  try {
    var slab = HEAP8;
    return FS.read(stream, slab, buf, nbyte, offset);
  } catch (e) {
    FS.handleFSError(e);
    return -1;
  }
}
function _read(fildes, buf, nbyte) {
  var stream = FS.getStream(fildes);
  if (!stream) {
    ___setErrNo(ERRNO_CODES.EBADF);
    return -1;
  }
  try {
    var slab = HEAP8;
    return FS.read(stream, slab, buf, nbyte);
  } catch (e) {
    FS.handleFSError(e);
    return -1;
  }
}
function _fread(ptr, size, nitems, stream) {
  var bytesToRead = nitems * size;
  if (bytesToRead == 0) {
    return 0;
  }
  var bytesRead = 0;
  var streamObj = FS.getStreamFromPtr(stream);
  if (!streamObj) {
    ___setErrNo(ERRNO_CODES.EBADF);
    return 0;
  }
  while (streamObj.ungotten.length && bytesToRead > 0) {
    HEAP8[ptr++ >> 0] = streamObj.ungotten.pop();
    bytesToRead--;
    bytesRead++;
  }
  var err = _read(streamObj.fd, ptr, bytesToRead);
  if (err == -1) {
    if (streamObj) streamObj.error = true;
    return 0;
  }
  bytesRead += err;
  if (bytesRead < bytesToRead) streamObj.eof = true;
  return (bytesRead / size) | 0;
}
function _fgetc(stream) {
  var streamObj = FS.getStreamFromPtr(stream);
  if (!streamObj) return -1;
  if (streamObj.eof || streamObj.error) return -1;
  var ret = _fread(_fgetc.ret, 1, 1, stream);
  if (ret == 0) {
    return -1;
  } else if (ret == -1) {
    streamObj.error = true;
    return -1;
  } else {
    return HEAPU8[_fgetc.ret >> 0];
  }
}
function _getc() {
  return _fgetc.apply(null, arguments);
}
function _embind_repr(v) {
  if (v === null) {
    return 'null';
  }
  var t = typeof v;
  if (t === 'object' || t === 'array' || t === 'function') {
    return v.toString();
  } else {
    return '' + v;
  }
}
function integerReadValueFromPointer(name, shift, signed) {
  switch (shift) {
    case 0:
      return signed
        ? function readS8FromPointer(pointer) {
            return HEAP8[pointer];
          }
        : function readU8FromPointer(pointer) {
            return HEAPU8[pointer];
          };
    case 1:
      return signed
        ? function readS16FromPointer(pointer) {
            return HEAP16[pointer >> 1];
          }
        : function readU16FromPointer(pointer) {
            return HEAPU16[pointer >> 1];
          };
    case 2:
      return signed
        ? function readS32FromPointer(pointer) {
            return HEAP32[pointer >> 2];
          }
        : function readU32FromPointer(pointer) {
            return HEAPU32[pointer >> 2];
          };
    default:
      throw new TypeError('Unknown integer type: ' + name);
  }
}
function __embind_register_integer(primitiveType, name, size, minRange, maxRange) {
  name = readLatin1String(name);
  if (maxRange === -1) {
    maxRange = 4294967295;
  }
  var shift = getShiftFromSize(size);
  registerType(primitiveType, {
    name: name,
    fromWireType: function(value) {
      return value;
    },
    toWireType: function(destructors, value) {
      if (typeof value !== 'number' && typeof value !== 'boolean') {
        throw new TypeError('Cannot convert "' + _embind_repr(value) + '" to ' + this.name);
      }
      if (value < minRange || value > maxRange) {
        throw new TypeError(
          'Passing a number "' +
            _embind_repr(value) +
            '" from JS side to C/C++ side to an argument of type "' +
            name +
            '", which is outside the valid range [' +
            minRange +
            ', ' +
            maxRange +
            ']!'
        );
      }
      return value | 0;
    },
    argPackAdvance: 8,
    readValueFromPointer: integerReadValueFromPointer(name, shift, minRange !== 0),
    destructorFunction: null
  });
}
function _emscripten_set_main_loop_timing(mode, value) {
  Browser.mainLoop.timingMode = mode;
  Browser.mainLoop.timingValue = value;
  if (!Browser.mainLoop.func) {
    return 1;
  }
  if (mode == 0) {
    Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler() {
      setTimeout(Browser.mainLoop.runner, value);
    };
    Browser.mainLoop.method = 'timeout';
  } else if (mode == 1) {
    Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler() {
      Browser.requestAnimationFrame(Browser.mainLoop.runner);
    };
    Browser.mainLoop.method = 'rAF';
  }
  return 0;
}
function _emscripten_set_main_loop(func, fps, simulateInfiniteLoop, arg) {
  Module['noExitRuntime'] = true;
  assert(
    !Browser.mainLoop.func,
    'emscripten_set_main_loop: there can only be one main loop function at once: call emscripten_cancel_main_loop to cancel the previous one before setting a new one with different parameters.'
  );
  Browser.mainLoop.func = func;
  Browser.mainLoop.arg = arg;
  var thisMainLoopId = Browser.mainLoop.currentlyRunningMainloop;
  Browser.mainLoop.runner = function Browser_mainLoop_runner() {
    if (ABORT) return;
    if (Browser.mainLoop.queue.length > 0) {
      var start = Date.now();
      var blocker = Browser.mainLoop.queue.shift();
      blocker.func(blocker.arg);
      if (Browser.mainLoop.remainingBlockers) {
        var remaining = Browser.mainLoop.remainingBlockers;
        var next = remaining % 1 == 0 ? remaining - 1 : Math.floor(remaining);
        if (blocker.counted) {
          Browser.mainLoop.remainingBlockers = next;
        } else {
          next = next + 0.5;
          Browser.mainLoop.remainingBlockers = (8 * remaining + next) / 9;
        }
      }
      console.log('main loop blocker "' + blocker.name + '" took ' + (Date.now() - start) + ' ms');
      Browser.mainLoop.updateStatus();
      setTimeout(Browser.mainLoop.runner, 0);
      return;
    }
    if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
    Browser.mainLoop.currentFrameNumber = (Browser.mainLoop.currentFrameNumber + 1) | 0;
    if (
      Browser.mainLoop.timingMode == 1 &&
      Browser.mainLoop.timingValue > 1 &&
      Browser.mainLoop.currentFrameNumber % Browser.mainLoop.timingValue != 0
    ) {
      Browser.mainLoop.scheduler();
      return;
    }
    if (Browser.mainLoop.method === 'timeout' && Module.ctx) {
      Module.printErr(
        'Looks like you are rendering without using requestAnimationFrame for the main loop. You should use 0 for the frame rate in emscripten_set_main_loop in order to use requestAnimationFrame, as that can greatly improve your frame rates!'
      );
      Browser.mainLoop.method = '';
    }
    Browser.mainLoop.runIter(function() {
      if (typeof arg !== 'undefined') {
        Runtime.dynCall('vi', func, [arg]);
      } else {
        Runtime.dynCall('v', func);
      }
    });
    if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
    if (typeof SDL === 'object' && SDL.audio && SDL.audio.queueNewAudioData)
      SDL.audio.queueNewAudioData();
    Browser.mainLoop.scheduler();
  };
  if (fps && fps > 0) _emscripten_set_main_loop_timing(0, 1e3 / fps);
  else _emscripten_set_main_loop_timing(1, 1);
  Browser.mainLoop.scheduler();
  if (simulateInfiniteLoop) {
    throw 'SimulateInfiniteLoop';
  }
}
var Browser = {
  mainLoop: {
    scheduler: null,
    method: '',
    currentlyRunningMainloop: 0,
    func: null,
    arg: 0,
    timingMode: 0,
    timingValue: 0,
    currentFrameNumber: 0,
    queue: [],
    pause: function() {
      Browser.mainLoop.scheduler = null;
      Browser.mainLoop.currentlyRunningMainloop++;
    },
    resume: function() {
      Browser.mainLoop.currentlyRunningMainloop++;
      var timingMode = Browser.mainLoop.timingMode;
      var timingValue = Browser.mainLoop.timingValue;
      var func = Browser.mainLoop.func;
      Browser.mainLoop.func = null;
      _emscripten_set_main_loop(func, 0, false, Browser.mainLoop.arg);
      _emscripten_set_main_loop_timing(timingMode, timingValue);
    },
    updateStatus: function() {
      if (Module['setStatus']) {
        var message = Module['statusMessage'] || 'Please wait...';
        var remaining = Browser.mainLoop.remainingBlockers;
        var expected = Browser.mainLoop.expectedBlockers;
        if (remaining) {
          if (remaining < expected) {
            Module['setStatus'](message + ' (' + (expected - remaining) + '/' + expected + ')');
          } else {
            Module['setStatus'](message);
          }
        } else {
          Module['setStatus']('');
        }
      }
    },
    runIter: function(func) {
      if (ABORT) return;
      if (Module['preMainLoop']) {
        var preRet = Module['preMainLoop']();
        if (preRet === false) {
          return;
        }
      }
      try {
        func();
      } catch (e) {
        if (e instanceof ExitStatus) {
          return;
        } else {
          if (e && typeof e === 'object' && e.stack)
            Module.printErr('exception thrown: ' + [e, e.stack]);
          throw e;
        }
      }
      if (Module['postMainLoop']) Module['postMainLoop']();
    }
  },
  isFullScreen: false,
  pointerLock: false,
  moduleContextCreatedCallbacks: [],
  workers: [],
  init: function() {
    if (!Module['preloadPlugins']) Module['preloadPlugins'] = [];
    if (Browser.initted) return;
    Browser.initted = true;
    try {
      new Blob();
      Browser.hasBlobConstructor = true;
    } catch (e) {
      Browser.hasBlobConstructor = false;
      console.log('warning: no blob constructor, cannot create blobs with mimetypes');
    }
    Browser.BlobBuilder =
      typeof MozBlobBuilder != 'undefined'
        ? MozBlobBuilder
        : typeof WebKitBlobBuilder != 'undefined'
          ? WebKitBlobBuilder
          : !Browser.hasBlobConstructor
            ? console.log('warning: no BlobBuilder')
            : null;
    Browser.URLObject =
      typeof window != 'undefined' ? (window.URL ? window.URL : window.webkitURL) : undefined;
    if (!Module.noImageDecoding && typeof Browser.URLObject === 'undefined') {
      console.log(
        'warning: Browser does not support creating object URLs. Built-in browser image decoding will not be available.'
      );
      Module.noImageDecoding = true;
    }
    var imagePlugin = {};
    imagePlugin['canHandle'] = function imagePlugin_canHandle(name) {
      return !Module.noImageDecoding && /\.(jpg|jpeg|png|bmp)$/i.test(name);
    };
    imagePlugin['handle'] = function imagePlugin_handle(byteArray, name, onload, onerror) {
      var b = null;
      if (Browser.hasBlobConstructor) {
        try {
          b = new Blob([byteArray], {type: Browser.getMimetype(name)});
          if (b.size !== byteArray.length) {
            b = new Blob([new Uint8Array(byteArray).buffer], {type: Browser.getMimetype(name)});
          }
        } catch (e) {
          Runtime.warnOnce(
            'Blob constructor present but fails: ' + e + '; falling back to blob builder'
          );
        }
      }
      if (!b) {
        var bb = new Browser.BlobBuilder();
        bb.append(new Uint8Array(byteArray).buffer);
        b = bb.getBlob();
      }
      var url = Browser.URLObject.createObjectURL(b);
      var img = new Image();
      img.onload = function img_onload() {
        assert(img.complete, 'Image ' + name + ' could not be decoded');
        var canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        Module['preloadedImages'][name] = canvas;
        Browser.URLObject.revokeObjectURL(url);
        if (onload) onload(byteArray);
      };
      img.onerror = function img_onerror(event) {
        console.log('Image ' + url + ' could not be decoded');
        if (onerror) onerror();
      };
      img.src = url;
    };
    Module['preloadPlugins'].push(imagePlugin);
    var audioPlugin = {};
    audioPlugin['canHandle'] = function audioPlugin_canHandle(name) {
      return !Module.noAudioDecoding && name.substr(-4) in {'.ogg': 1, '.wav': 1, '.mp3': 1};
    };
    audioPlugin['handle'] = function audioPlugin_handle(byteArray, name, onload, onerror) {
      var done = false;
      function finish(audio) {
        if (done) return;
        done = true;
        Module['preloadedAudios'][name] = audio;
        if (onload) onload(byteArray);
      }
      function fail() {
        if (done) return;
        done = true;
        Module['preloadedAudios'][name] = new Audio();
        if (onerror) onerror();
      }
      if (Browser.hasBlobConstructor) {
        try {
          var b = new Blob([byteArray], {type: Browser.getMimetype(name)});
        } catch (e) {
          return fail();
        }
        var url = Browser.URLObject.createObjectURL(b);
        var audio = new Audio();
        audio.addEventListener(
          'canplaythrough',
          function() {
            finish(audio);
          },
          false
        );
        audio.onerror = function audio_onerror(event) {
          if (done) return;
          console.log(
            'warning: browser could not fully decode audio ' +
              name +
              ', trying slower base64 approach'
          );
          function encode64(data) {
            var BASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
            var PAD = '=';
            var ret = '';
            var leftchar = 0;
            var leftbits = 0;
            for (var i = 0; i < data.length; i++) {
              leftchar = (leftchar << 8) | data[i];
              leftbits += 8;
              while (leftbits >= 6) {
                var curr = (leftchar >> (leftbits - 6)) & 63;
                leftbits -= 6;
                ret += BASE[curr];
              }
            }
            if (leftbits == 2) {
              ret += BASE[(leftchar & 3) << 4];
              ret += PAD + PAD;
            } else if (leftbits == 4) {
              ret += BASE[(leftchar & 15) << 2];
              ret += PAD;
            }
            return ret;
          }
          audio.src = 'data:audio/x-' + name.substr(-3) + ';base64,' + encode64(byteArray);
          finish(audio);
        };
        audio.src = url;
        Browser.safeSetTimeout(function() {
          finish(audio);
        }, 1e4);
      } else {
        return fail();
      }
    };
    Module['preloadPlugins'].push(audioPlugin);
    var canvas = Module['canvas'];
    function pointerLockChange() {
      Browser.pointerLock =
        document['pointerLockElement'] === canvas ||
        document['mozPointerLockElement'] === canvas ||
        document['webkitPointerLockElement'] === canvas ||
        document['msPointerLockElement'] === canvas;
    }
    if (canvas) {
      canvas.requestPointerLock =
        canvas['requestPointerLock'] ||
        canvas['mozRequestPointerLock'] ||
        canvas['webkitRequestPointerLock'] ||
        canvas['msRequestPointerLock'] ||
        function() {};
      canvas.exitPointerLock =
        document['exitPointerLock'] ||
        document['mozExitPointerLock'] ||
        document['webkitExitPointerLock'] ||
        document['msExitPointerLock'] ||
        function() {};
      canvas.exitPointerLock = canvas.exitPointerLock.bind(document);
      document.addEventListener('pointerlockchange', pointerLockChange, false);
      document.addEventListener('mozpointerlockchange', pointerLockChange, false);
      document.addEventListener('webkitpointerlockchange', pointerLockChange, false);
      document.addEventListener('mspointerlockchange', pointerLockChange, false);
      if (Module['elementPointerLock']) {
        canvas.addEventListener(
          'click',
          function(ev) {
            if (!Browser.pointerLock && canvas.requestPointerLock) {
              canvas.requestPointerLock();
              ev.preventDefault();
            }
          },
          false
        );
      }
    }
  },
  createContext: function(canvas, useWebGL, setInModule, webGLContextAttributes) {
    if (useWebGL && Module.ctx && canvas == Module.canvas) return Module.ctx;
    var ctx;
    var contextHandle;
    if (useWebGL) {
      var contextAttributes = {antialias: false, alpha: false};
      if (webGLContextAttributes) {
        for (var attribute in webGLContextAttributes) {
          contextAttributes[attribute] = webGLContextAttributes[attribute];
        }
      }
      contextHandle = GL.createContext(canvas, contextAttributes);
      if (contextHandle) {
        ctx = GL.getContext(contextHandle).GLctx;
      }
      canvas.style.backgroundColor = 'black';
    } else {
      ctx = canvas.getContext('2d');
    }
    if (!ctx) return null;
    if (setInModule) {
      if (!useWebGL)
        assert(
          typeof GLctx === 'undefined',
          'cannot set in module if GLctx is used, but we are a non-GL context that would replace it'
        );
      Module.ctx = ctx;
      if (useWebGL) GL.makeContextCurrent(contextHandle);
      Module.useWebGL = useWebGL;
      Browser.moduleContextCreatedCallbacks.forEach(function(callback) {
        callback();
      });
      Browser.init();
    }
    return ctx;
  },
  destroyContext: function(canvas, useWebGL, setInModule) {},
  fullScreenHandlersInstalled: false,
  lockPointer: undefined,
  resizeCanvas: undefined,
  requestFullScreen: function(lockPointer, resizeCanvas) {
    Browser.lockPointer = lockPointer;
    Browser.resizeCanvas = resizeCanvas;
    if (typeof Browser.lockPointer === 'undefined') Browser.lockPointer = true;
    if (typeof Browser.resizeCanvas === 'undefined') Browser.resizeCanvas = false;
    var canvas = Module['canvas'];
    function fullScreenChange() {
      Browser.isFullScreen = false;
      var canvasContainer = canvas.parentNode;
      if (
        (document['webkitFullScreenElement'] ||
          document['webkitFullscreenElement'] ||
          document['mozFullScreenElement'] ||
          document['mozFullscreenElement'] ||
          document['fullScreenElement'] ||
          document['fullscreenElement'] ||
          document['msFullScreenElement'] ||
          document['msFullscreenElement'] ||
          document['webkitCurrentFullScreenElement']) === canvasContainer
      ) {
        canvas.cancelFullScreen =
          document['cancelFullScreen'] ||
          document['mozCancelFullScreen'] ||
          document['webkitCancelFullScreen'] ||
          document['msExitFullscreen'] ||
          document['exitFullscreen'] ||
          function() {};
        canvas.cancelFullScreen = canvas.cancelFullScreen.bind(document);
        if (Browser.lockPointer) canvas.requestPointerLock();
        Browser.isFullScreen = true;
        if (Browser.resizeCanvas) Browser.setFullScreenCanvasSize();
      } else {
        canvasContainer.parentNode.insertBefore(canvas, canvasContainer);
        canvasContainer.parentNode.removeChild(canvasContainer);
        if (Browser.resizeCanvas) Browser.setWindowedCanvasSize();
      }
      if (Module['onFullScreen']) Module['onFullScreen'](Browser.isFullScreen);
      Browser.updateCanvasDimensions(canvas);
    }
    if (!Browser.fullScreenHandlersInstalled) {
      Browser.fullScreenHandlersInstalled = true;
      document.addEventListener('fullscreenchange', fullScreenChange, false);
      document.addEventListener('mozfullscreenchange', fullScreenChange, false);
      document.addEventListener('webkitfullscreenchange', fullScreenChange, false);
      document.addEventListener('MSFullscreenChange', fullScreenChange, false);
    }
    var canvasContainer = document.createElement('div');
    canvas.parentNode.insertBefore(canvasContainer, canvas);
    canvasContainer.appendChild(canvas);
    canvasContainer.requestFullScreen =
      canvasContainer['requestFullScreen'] ||
      canvasContainer['mozRequestFullScreen'] ||
      canvasContainer['msRequestFullscreen'] ||
      (canvasContainer['webkitRequestFullScreen']
        ? function() {
            canvasContainer['webkitRequestFullScreen'](Element['ALLOW_KEYBOARD_INPUT']);
          }
        : null);
    canvasContainer.requestFullScreen();
  },
  nextRAF: 0,
  fakeRequestAnimationFrame: function(func) {
    var now = Date.now();
    if (Browser.nextRAF === 0) {
      Browser.nextRAF = now + 1e3 / 60;
    } else {
      while (now + 2 >= Browser.nextRAF) {
        Browser.nextRAF += 1e3 / 60;
      }
    }
    var delay = Math.max(Browser.nextRAF - now, 0);
    setTimeout(func, delay);
  },
  requestAnimationFrame: function requestAnimationFrame(func) {
    if (typeof window === 'undefined') {
      Browser.fakeRequestAnimationFrame(func);
    } else {
      if (!window.requestAnimationFrame) {
        window.requestAnimationFrame =
          window['requestAnimationFrame'] ||
          window['mozRequestAnimationFrame'] ||
          window['webkitRequestAnimationFrame'] ||
          window['msRequestAnimationFrame'] ||
          window['oRequestAnimationFrame'] ||
          Browser.fakeRequestAnimationFrame;
      }
      window.requestAnimationFrame(func);
    }
  },
  safeCallback: function(func) {
    return function() {
      if (!ABORT) return func.apply(null, arguments);
    };
  },
  safeRequestAnimationFrame: function(func) {
    return Browser.requestAnimationFrame(function() {
      if (!ABORT) func();
    });
  },
  safeSetTimeout: function(func, timeout) {
    Module['noExitRuntime'] = true;
    return setTimeout(function() {
      if (!ABORT) func();
    }, timeout);
  },
  safeSetInterval: function(func, timeout) {
    Module['noExitRuntime'] = true;
    return setInterval(function() {
      if (!ABORT) func();
    }, timeout);
  },
  getMimetype: function(name) {
    return {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      bmp: 'image/bmp',
      ogg: 'audio/ogg',
      wav: 'audio/wav',
      mp3: 'audio/mpeg'
    }[name.substr(name.lastIndexOf('.') + 1)];
  },
  getUserMedia: function(func) {
    if (!window.getUserMedia) {
      window.getUserMedia = navigator['getUserMedia'] || navigator['mozGetUserMedia'];
    }
    window.getUserMedia(func);
  },
  getMovementX: function(event) {
    return event['movementX'] || event['mozMovementX'] || event['webkitMovementX'] || 0;
  },
  getMovementY: function(event) {
    return event['movementY'] || event['mozMovementY'] || event['webkitMovementY'] || 0;
  },
  getMouseWheelDelta: function(event) {
    var delta = 0;
    switch (event.type) {
      case 'DOMMouseScroll':
        delta = event.detail;
        break;
      case 'mousewheel':
        delta = event.wheelDelta;
        break;
      case 'wheel':
        delta = event['deltaY'];
        break;
      default:
        throw 'unrecognized mouse wheel event: ' + event.type;
    }
    return delta;
  },
  mouseX: 0,
  mouseY: 0,
  mouseMovementX: 0,
  mouseMovementY: 0,
  touches: {},
  lastTouches: {},
  calculateMouseEvent: function(event) {
    if (Browser.pointerLock) {
      if (event.type != 'mousemove' && 'mozMovementX' in event) {
        Browser.mouseMovementX = Browser.mouseMovementY = 0;
      } else {
        Browser.mouseMovementX = Browser.getMovementX(event);
        Browser.mouseMovementY = Browser.getMovementY(event);
      }
      if (typeof SDL != 'undefined') {
        Browser.mouseX = SDL.mouseX + Browser.mouseMovementX;
        Browser.mouseY = SDL.mouseY + Browser.mouseMovementY;
      } else {
        Browser.mouseX += Browser.mouseMovementX;
        Browser.mouseY += Browser.mouseMovementY;
      }
    } else {
      var rect = Module['canvas'].getBoundingClientRect();
      var cw = Module['canvas'].width;
      var ch = Module['canvas'].height;
      var scrollX = typeof window.scrollX !== 'undefined' ? window.scrollX : window.pageXOffset;
      var scrollY = typeof window.scrollY !== 'undefined' ? window.scrollY : window.pageYOffset;
      if (event.type === 'touchstart' || event.type === 'touchend' || event.type === 'touchmove') {
        var touch = event.touch;
        if (touch === undefined) {
          return;
        }
        var adjustedX = touch.pageX - (scrollX + rect.left);
        var adjustedY = touch.pageY - (scrollY + rect.top);
        adjustedX = adjustedX * (cw / rect.width);
        adjustedY = adjustedY * (ch / rect.height);
        var coords = {x: adjustedX, y: adjustedY};
        if (event.type === 'touchstart') {
          Browser.lastTouches[touch.identifier] = coords;
          Browser.touches[touch.identifier] = coords;
        } else if (event.type === 'touchend' || event.type === 'touchmove') {
          Browser.lastTouches[touch.identifier] = Browser.touches[touch.identifier];
          Browser.touches[touch.identifier] = {x: adjustedX, y: adjustedY};
        }
        return;
      }
      var x = event.pageX - (scrollX + rect.left);
      var y = event.pageY - (scrollY + rect.top);
      x = x * (cw / rect.width);
      y = y * (ch / rect.height);
      Browser.mouseMovementX = x - Browser.mouseX;
      Browser.mouseMovementY = y - Browser.mouseY;
      Browser.mouseX = x;
      Browser.mouseY = y;
    }
  },
  xhrLoad: function(url, onload, onerror) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function xhr_onload() {
      if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) {
        onload(xhr.response);
      } else {
        onerror();
      }
    };
    xhr.onerror = onerror;
    xhr.send(null);
  },
  asyncLoad: function(url, onload, onerror, noRunDep) {
    Browser.xhrLoad(
      url,
      function(arrayBuffer) {
        assert(arrayBuffer, 'Loading data file "' + url + '" failed (no arrayBuffer).');
        onload(new Uint8Array(arrayBuffer));
        if (!noRunDep) removeRunDependency('al ' + url);
      },
      function(event) {
        if (onerror) {
          onerror();
        } else {
          throw 'Loading data file "' + url + '" failed.';
        }
      }
    );
    if (!noRunDep) addRunDependency('al ' + url);
  },
  resizeListeners: [],
  updateResizeListeners: function() {
    var canvas = Module['canvas'];
    Browser.resizeListeners.forEach(function(listener) {
      listener(canvas.width, canvas.height);
    });
  },
  setCanvasSize: function(width, height, noUpdates) {
    var canvas = Module['canvas'];
    Browser.updateCanvasDimensions(canvas, width, height);
    if (!noUpdates) Browser.updateResizeListeners();
  },
  windowedWidth: 0,
  windowedHeight: 0,
  setFullScreenCanvasSize: function() {
    if (typeof SDL != 'undefined') {
      var flags = HEAPU32[(SDL.screen + Runtime.QUANTUM_SIZE * 0) >> 2];
      flags = flags | 8388608;
      HEAP32[(SDL.screen + Runtime.QUANTUM_SIZE * 0) >> 2] = flags;
    }
    Browser.updateResizeListeners();
  },
  setWindowedCanvasSize: function() {
    if (typeof SDL != 'undefined') {
      var flags = HEAPU32[(SDL.screen + Runtime.QUANTUM_SIZE * 0) >> 2];
      flags = flags & ~8388608;
      HEAP32[(SDL.screen + Runtime.QUANTUM_SIZE * 0) >> 2] = flags;
    }
    Browser.updateResizeListeners();
  },
  updateCanvasDimensions: function(canvas, wNative, hNative) {
    if (wNative && hNative) {
      canvas.widthNative = wNative;
      canvas.heightNative = hNative;
    } else {
      wNative = canvas.widthNative;
      hNative = canvas.heightNative;
    }
    var w = wNative;
    var h = hNative;
    if (Module['forcedAspectRatio'] && Module['forcedAspectRatio'] > 0) {
      if (w / h < Module['forcedAspectRatio']) {
        w = Math.round(h * Module['forcedAspectRatio']);
      } else {
        h = Math.round(w / Module['forcedAspectRatio']);
      }
    }
    if (
      (document['webkitFullScreenElement'] ||
        document['webkitFullscreenElement'] ||
        document['mozFullScreenElement'] ||
        document['mozFullscreenElement'] ||
        document['fullScreenElement'] ||
        document['fullscreenElement'] ||
        document['msFullScreenElement'] ||
        document['msFullscreenElement'] ||
        document['webkitCurrentFullScreenElement']) === canvas.parentNode &&
      typeof screen != 'undefined'
    ) {
      var factor = Math.min(screen.width / w, screen.height / h);
      w = Math.round(w * factor);
      h = Math.round(h * factor);
    }
    if (Browser.resizeCanvas) {
      if (canvas.width != w) canvas.width = w;
      if (canvas.height != h) canvas.height = h;
      if (typeof canvas.style != 'undefined') {
        canvas.style.removeProperty('width');
        canvas.style.removeProperty('height');
      }
    } else {
      if (canvas.width != wNative) canvas.width = wNative;
      if (canvas.height != hNative) canvas.height = hNative;
      if (typeof canvas.style != 'undefined') {
        if (w != wNative || h != hNative) {
          canvas.style.setProperty('width', w + 'px', 'important');
          canvas.style.setProperty('height', h + 'px', 'important');
        } else {
          canvas.style.removeProperty('width');
          canvas.style.removeProperty('height');
        }
      }
    }
  },
  wgetRequests: {},
  nextWgetRequestHandle: 0,
  getNextWgetRequestHandle: function() {
    var handle = Browser.nextWgetRequestHandle;
    Browser.nextWgetRequestHandle++;
    return handle;
  }
};
function _pthread_setspecific(key, value) {
  if (!(key in PTHREAD_SPECIFIC)) {
    return ERRNO_CODES.EINVAL;
  }
  PTHREAD_SPECIFIC[key] = value;
  return 0;
}
function ___ctype_b_loc() {
  var me = ___ctype_b_loc;
  if (!me.ret) {
    var values = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      8195,
      8194,
      8194,
      8194,
      8194,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      24577,
      49156,
      49156,
      49156,
      49156,
      49156,
      49156,
      49156,
      49156,
      49156,
      49156,
      49156,
      49156,
      49156,
      49156,
      49156,
      55304,
      55304,
      55304,
      55304,
      55304,
      55304,
      55304,
      55304,
      55304,
      55304,
      49156,
      49156,
      49156,
      49156,
      49156,
      49156,
      49156,
      54536,
      54536,
      54536,
      54536,
      54536,
      54536,
      50440,
      50440,
      50440,
      50440,
      50440,
      50440,
      50440,
      50440,
      50440,
      50440,
      50440,
      50440,
      50440,
      50440,
      50440,
      50440,
      50440,
      50440,
      50440,
      50440,
      49156,
      49156,
      49156,
      49156,
      49156,
      49156,
      54792,
      54792,
      54792,
      54792,
      54792,
      54792,
      50696,
      50696,
      50696,
      50696,
      50696,
      50696,
      50696,
      50696,
      50696,
      50696,
      50696,
      50696,
      50696,
      50696,
      50696,
      50696,
      50696,
      50696,
      50696,
      50696,
      49156,
      49156,
      49156,
      49156,
      2,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ];
    var i16size = 2;
    var arr = _malloc(values.length * i16size);
    for (var i = 0; i < values.length; i++) {
      HEAP16[(arr + i * i16size) >> 1] = values[i];
    }
    me.ret = allocate([arr + 128 * i16size], 'i16*', ALLOC_NORMAL);
  }
  return me.ret;
}
function _freelocale(locale) {
  _free(locale);
}
function ___cxa_allocate_exception(size) {
  return _malloc(size);
}
function _fmod(x, y) {
  return x % y;
}
function _fmodl() {
  return _fmod.apply(null, arguments);
}
function _catopen(name, oflag) {
  return -1;
}
function _catgets(catd, set_id, msg_id, s) {
  return s;
}
function floatReadValueFromPointer(name, shift) {
  switch (shift) {
    case 2:
      return function(pointer) {
        return this['fromWireType'](HEAPF32[pointer >> 2]);
      };
    case 3:
      return function(pointer) {
        return this['fromWireType'](HEAPF64[pointer >> 3]);
      };
    default:
      throw new TypeError('Unknown float type: ' + name);
  }
}
function __embind_register_float(rawType, name, size) {
  var shift = getShiftFromSize(size);
  name = readLatin1String(name);
  registerType(rawType, {
    name: name,
    fromWireType: function(value) {
      return value;
    },
    toWireType: function(destructors, value) {
      if (typeof value !== 'number' && typeof value !== 'boolean') {
        throw new TypeError('Cannot convert "' + _embind_repr(value) + '" to ' + this.name);
      }
      return value;
    },
    argPackAdvance: 8,
    readValueFromPointer: floatReadValueFromPointer(name, shift),
    destructorFunction: null
  });
}
function _time(ptr) {
  var ret = (Date.now() / 1e3) | 0;
  if (ptr) {
    HEAP32[ptr >> 2] = ret;
  }
  return ret;
}
function ___ctype_toupper_loc() {
  var me = ___ctype_toupper_loc;
  if (!me.ret) {
    var values = [
      128,
      129,
      130,
      131,
      132,
      133,
      134,
      135,
      136,
      137,
      138,
      139,
      140,
      141,
      142,
      143,
      144,
      145,
      146,
      147,
      148,
      149,
      150,
      151,
      152,
      153,
      154,
      155,
      156,
      157,
      158,
      159,
      160,
      161,
      162,
      163,
      164,
      165,
      166,
      167,
      168,
      169,
      170,
      171,
      172,
      173,
      174,
      175,
      176,
      177,
      178,
      179,
      180,
      181,
      182,
      183,
      184,
      185,
      186,
      187,
      188,
      189,
      190,
      191,
      192,
      193,
      194,
      195,
      196,
      197,
      198,
      199,
      200,
      201,
      202,
      203,
      204,
      205,
      206,
      207,
      208,
      209,
      210,
      211,
      212,
      213,
      214,
      215,
      216,
      217,
      218,
      219,
      220,
      221,
      222,
      223,
      224,
      225,
      226,
      227,
      228,
      229,
      230,
      231,
      232,
      233,
      234,
      235,
      236,
      237,
      238,
      239,
      240,
      241,
      242,
      243,
      244,
      245,
      246,
      247,
      248,
      249,
      250,
      251,
      252,
      253,
      254,
      -1,
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
      21,
      22,
      23,
      24,
      25,
      26,
      27,
      28,
      29,
      30,
      31,
      32,
      33,
      34,
      35,
      36,
      37,
      38,
      39,
      40,
      41,
      42,
      43,
      44,
      45,
      46,
      47,
      48,
      49,
      50,
      51,
      52,
      53,
      54,
      55,
      56,
      57,
      58,
      59,
      60,
      61,
      62,
      63,
      64,
      65,
      66,
      67,
      68,
      69,
      70,
      71,
      72,
      73,
      74,
      75,
      76,
      77,
      78,
      79,
      80,
      81,
      82,
      83,
      84,
      85,
      86,
      87,
      88,
      89,
      90,
      91,
      92,
      93,
      94,
      95,
      96,
      65,
      66,
      67,
      68,
      69,
      70,
      71,
      72,
      73,
      74,
      75,
      76,
      77,
      78,
      79,
      80,
      81,
      82,
      83,
      84,
      85,
      86,
      87,
      88,
      89,
      90,
      123,
      124,
      125,
      126,
      127,
      128,
      129,
      130,
      131,
      132,
      133,
      134,
      135,
      136,
      137,
      138,
      139,
      140,
      141,
      142,
      143,
      144,
      145,
      146,
      147,
      148,
      149,
      150,
      151,
      152,
      153,
      154,
      155,
      156,
      157,
      158,
      159,
      160,
      161,
      162,
      163,
      164,
      165,
      166,
      167,
      168,
      169,
      170,
      171,
      172,
      173,
      174,
      175,
      176,
      177,
      178,
      179,
      180,
      181,
      182,
      183,
      184,
      185,
      186,
      187,
      188,
      189,
      190,
      191,
      192,
      193,
      194,
      195,
      196,
      197,
      198,
      199,
      200,
      201,
      202,
      203,
      204,
      205,
      206,
      207,
      208,
      209,
      210,
      211,
      212,
      213,
      214,
      215,
      216,
      217,
      218,
      219,
      220,
      221,
      222,
      223,
      224,
      225,
      226,
      227,
      228,
      229,
      230,
      231,
      232,
      233,
      234,
      235,
      236,
      237,
      238,
      239,
      240,
      241,
      242,
      243,
      244,
      245,
      246,
      247,
      248,
      249,
      250,
      251,
      252,
      253,
      254,
      255
    ];
    var i32size = 4;
    var arr = _malloc(values.length * i32size);
    for (var i = 0; i < values.length; i++) {
      HEAP32[(arr + i * i32size) >> 2] = values[i];
    }
    me.ret = allocate([arr + 128 * i32size], 'i32*', ALLOC_NORMAL);
  }
  return me.ret;
}
function ___cxa_guard_acquire(variable) {
  if (!HEAP8[variable >> 0]) {
    HEAP8[variable >> 0] = 1;
    return 1;
  }
  return 0;
}
function ___ctype_tolower_loc() {
  var me = ___ctype_tolower_loc;
  if (!me.ret) {
    var values = [
      128,
      129,
      130,
      131,
      132,
      133,
      134,
      135,
      136,
      137,
      138,
      139,
      140,
      141,
      142,
      143,
      144,
      145,
      146,
      147,
      148,
      149,
      150,
      151,
      152,
      153,
      154,
      155,
      156,
      157,
      158,
      159,
      160,
      161,
      162,
      163,
      164,
      165,
      166,
      167,
      168,
      169,
      170,
      171,
      172,
      173,
      174,
      175,
      176,
      177,
      178,
      179,
      180,
      181,
      182,
      183,
      184,
      185,
      186,
      187,
      188,
      189,
      190,
      191,
      192,
      193,
      194,
      195,
      196,
      197,
      198,
      199,
      200,
      201,
      202,
      203,
      204,
      205,
      206,
      207,
      208,
      209,
      210,
      211,
      212,
      213,
      214,
      215,
      216,
      217,
      218,
      219,
      220,
      221,
      222,
      223,
      224,
      225,
      226,
      227,
      228,
      229,
      230,
      231,
      232,
      233,
      234,
      235,
      236,
      237,
      238,
      239,
      240,
      241,
      242,
      243,
      244,
      245,
      246,
      247,
      248,
      249,
      250,
      251,
      252,
      253,
      254,
      -1,
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
      21,
      22,
      23,
      24,
      25,
      26,
      27,
      28,
      29,
      30,
      31,
      32,
      33,
      34,
      35,
      36,
      37,
      38,
      39,
      40,
      41,
      42,
      43,
      44,
      45,
      46,
      47,
      48,
      49,
      50,
      51,
      52,
      53,
      54,
      55,
      56,
      57,
      58,
      59,
      60,
      61,
      62,
      63,
      64,
      97,
      98,
      99,
      100,
      101,
      102,
      103,
      104,
      105,
      106,
      107,
      108,
      109,
      110,
      111,
      112,
      113,
      114,
      115,
      116,
      117,
      118,
      119,
      120,
      121,
      122,
      91,
      92,
      93,
      94,
      95,
      96,
      97,
      98,
      99,
      100,
      101,
      102,
      103,
      104,
      105,
      106,
      107,
      108,
      109,
      110,
      111,
      112,
      113,
      114,
      115,
      116,
      117,
      118,
      119,
      120,
      121,
      122,
      123,
      124,
      125,
      126,
      127,
      128,
      129,
      130,
      131,
      132,
      133,
      134,
      135,
      136,
      137,
      138,
      139,
      140,
      141,
      142,
      143,
      144,
      145,
      146,
      147,
      148,
      149,
      150,
      151,
      152,
      153,
      154,
      155,
      156,
      157,
      158,
      159,
      160,
      161,
      162,
      163,
      164,
      165,
      166,
      167,
      168,
      169,
      170,
      171,
      172,
      173,
      174,
      175,
      176,
      177,
      178,
      179,
      180,
      181,
      182,
      183,
      184,
      185,
      186,
      187,
      188,
      189,
      190,
      191,
      192,
      193,
      194,
      195,
      196,
      197,
      198,
      199,
      200,
      201,
      202,
      203,
      204,
      205,
      206,
      207,
      208,
      209,
      210,
      211,
      212,
      213,
      214,
      215,
      216,
      217,
      218,
      219,
      220,
      221,
      222,
      223,
      224,
      225,
      226,
      227,
      228,
      229,
      230,
      231,
      232,
      233,
      234,
      235,
      236,
      237,
      238,
      239,
      240,
      241,
      242,
      243,
      244,
      245,
      246,
      247,
      248,
      249,
      250,
      251,
      252,
      253,
      254,
      255
    ];
    var i32size = 4;
    var arr = _malloc(values.length * i32size);
    for (var i = 0; i < values.length; i++) {
      HEAP32[(arr + i * i32size) >> 2] = values[i];
    }
    me.ret = allocate([arr + 128 * i32size], 'i32*', ALLOC_NORMAL);
  }
  return me.ret;
}
function ___cxa_begin_catch(ptr) {
  __ZSt18uncaught_exceptionv.uncaught_exception--;
  EXCEPTIONS.caught.push(ptr);
  EXCEPTIONS.addRef(EXCEPTIONS.deAdjust(ptr));
  return ptr;
}
var PTHREAD_SPECIFIC_NEXT_KEY = 1;
function _pthread_key_create(key, destructor) {
  if (key == 0) {
    return ERRNO_CODES.EINVAL;
  }
  HEAP32[key >> 2] = PTHREAD_SPECIFIC_NEXT_KEY;
  PTHREAD_SPECIFIC[PTHREAD_SPECIFIC_NEXT_KEY] = 0;
  PTHREAD_SPECIFIC_NEXT_KEY++;
  return 0;
}
function heap32VectorToArray(count, firstElement) {
  var array = [];
  for (var i = 0; i < count; i++) {
    array.push(HEAP32[(firstElement >> 2) + i]);
  }
  return array;
}
function runDestructors(destructors) {
  while (destructors.length) {
    var ptr = destructors.pop();
    var del = destructors.pop();
    del(ptr);
  }
}
function __embind_register_class_constructor(
  rawClassType,
  argCount,
  rawArgTypesAddr,
  invokerSignature,
  invoker,
  rawConstructor
) {
  var rawArgTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
  invoker = requireFunction(invokerSignature, invoker);
  whenDependentTypesAreResolved([], [rawClassType], function(classType) {
    classType = classType[0];
    var humanName = 'constructor ' + classType.name;
    if (undefined === classType.registeredClass.constructor_body) {
      classType.registeredClass.constructor_body = [];
    }
    if (undefined !== classType.registeredClass.constructor_body[argCount - 1]) {
      throw new BindingError(
        'Cannot register multiple constructors with identical number of parameters (' +
          (argCount - 1) +
          ") for class '" +
          classType.name +
          "'! Overload resolution is currently only performed using the parameter count, not actual type info!"
      );
    }
    classType.registeredClass.constructor_body[argCount - 1] = function unboundTypeHandler() {
      throwUnboundTypeError(
        'Cannot construct ' + classType.name + ' due to unbound types',
        rawArgTypes
      );
    };
    whenDependentTypesAreResolved([], rawArgTypes, function(argTypes) {
      classType.registeredClass.constructor_body[argCount - 1] = function constructor_body() {
        if (arguments.length !== argCount - 1) {
          throwBindingError(
            humanName +
              ' called with ' +
              arguments.length +
              ' arguments, expected ' +
              (argCount - 1)
          );
        }
        var destructors = [];
        var args = new Array(argCount);
        args[0] = rawConstructor;
        for (var i = 1; i < argCount; ++i) {
          args[i] = argTypes[i]['toWireType'](destructors, arguments[i - 1]);
        }
        var ptr = invoker.apply(null, args);
        runDestructors(destructors);
        return argTypes[0]['fromWireType'](ptr);
      };
      return [];
    });
    return [];
  });
}
function _copysign(a, b) {
  return __reallyNegative(a) === __reallyNegative(b) ? a : -a;
}
function _copysignl() {
  return _copysign.apply(null, arguments);
}
function new_(constructor, argumentList) {
  if (!(constructor instanceof Function)) {
    throw new TypeError(
      'new_ called with constructor type ' + typeof constructor + ' which is not a function'
    );
  }
  var dummy = createNamedFunction(constructor.name || 'unknownFunctionName', function() {});
  dummy.prototype = constructor.prototype;
  var obj = new dummy();
  var r = constructor.apply(obj, argumentList);
  return r instanceof Object ? r : obj;
}
function craftInvokerFunction(humanName, argTypes, classType, cppInvokerFunc, cppTargetFunc) {
  var argCount = argTypes.length;
  if (argCount < 2) {
    throwBindingError(
      "argTypes array size mismatch! Must at least get return value and 'this' types!"
    );
  }
  var isClassMethodFunc = argTypes[1] !== null && classType !== null;
  var argsList = '';
  var argsListWired = '';
  for (var i = 0; i < argCount - 2; ++i) {
    argsList += (i !== 0 ? ', ' : '') + 'arg' + i;
    argsListWired += (i !== 0 ? ', ' : '') + 'arg' + i + 'Wired';
  }
  var invokerFnBody =
    'return function ' +
    makeLegalFunctionName(humanName) +
    '(' +
    argsList +
    ') {\n' +
    'if (arguments.length !== ' +
    (argCount - 2) +
    ') {\n' +
    "throwBindingError('function " +
    humanName +
    " called with ' + arguments.length + ' arguments, expected " +
    (argCount - 2) +
    " args!');\n" +
    '}\n';
  var needsDestructorStack = false;
  for (var i = 1; i < argTypes.length; ++i) {
    if (argTypes[i] !== null && argTypes[i].destructorFunction === undefined) {
      needsDestructorStack = true;
      break;
    }
  }
  if (needsDestructorStack) {
    invokerFnBody += 'var destructors = [];\n';
  }
  var dtorStack = needsDestructorStack ? 'destructors' : 'null';
  var args1 = ['throwBindingError', 'invoker', 'fn', 'runDestructors', 'retType', 'classParam'];
  var args2 = [
    throwBindingError,
    cppInvokerFunc,
    cppTargetFunc,
    runDestructors,
    argTypes[0],
    argTypes[1]
  ];
  if (isClassMethodFunc) {
    invokerFnBody += 'var thisWired = classParam.toWireType(' + dtorStack + ', this);\n';
  }
  for (var i = 0; i < argCount - 2; ++i) {
    invokerFnBody +=
      'var arg' +
      i +
      'Wired = argType' +
      i +
      '.toWireType(' +
      dtorStack +
      ', arg' +
      i +
      '); // ' +
      argTypes[i + 2].name +
      '\n';
    args1.push('argType' + i);
    args2.push(argTypes[i + 2]);
  }
  if (isClassMethodFunc) {
    argsListWired = 'thisWired' + (argsListWired.length > 0 ? ', ' : '') + argsListWired;
  }
  var returns = argTypes[0].name !== 'void';
  invokerFnBody +=
    (returns ? 'var rv = ' : '') +
    'invoker(fn' +
    (argsListWired.length > 0 ? ', ' : '') +
    argsListWired +
    ');\n';
  if (needsDestructorStack) {
    invokerFnBody += 'runDestructors(destructors);\n';
  } else {
    for (var i = isClassMethodFunc ? 1 : 2; i < argTypes.length; ++i) {
      var paramName = i === 1 ? 'thisWired' : 'arg' + (i - 2) + 'Wired';
      if (argTypes[i].destructorFunction !== null) {
        invokerFnBody += paramName + '_dtor(' + paramName + '); // ' + argTypes[i].name + '\n';
        args1.push(paramName + '_dtor');
        args2.push(argTypes[i].destructorFunction);
      }
    }
  }
  if (returns) {
    invokerFnBody += 'var ret = retType.fromWireType(rv);\n' + 'return ret;\n';
  } else {
  }
  invokerFnBody += '}\n';
  args1.push(invokerFnBody);
  var invokerFunction = new_(Function, args1).apply(null, args2);
  return invokerFunction;
}
function __embind_register_class_function(
  rawClassType,
  methodName,
  argCount,
  rawArgTypesAddr,
  invokerSignature,
  rawInvoker,
  context,
  isPureVirtual
) {
  var rawArgTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
  methodName = readLatin1String(methodName);
  rawInvoker = requireFunction(invokerSignature, rawInvoker);
  whenDependentTypesAreResolved([], [rawClassType], function(classType) {
    classType = classType[0];
    var humanName = classType.name + '.' + methodName;
    if (isPureVirtual) {
      classType.registeredClass.pureVirtualFunctions.push(methodName);
    }
    function unboundTypesHandler() {
      throwUnboundTypeError('Cannot call ' + humanName + ' due to unbound types', rawArgTypes);
    }
    var proto = classType.registeredClass.instancePrototype;
    var method = proto[methodName];
    if (
      undefined === method ||
      (undefined === method.overloadTable &&
        method.className !== classType.name &&
        method.argCount === argCount - 2)
    ) {
      unboundTypesHandler.argCount = argCount - 2;
      unboundTypesHandler.className = classType.name;
      proto[methodName] = unboundTypesHandler;
    } else {
      ensureOverloadTable(proto, methodName, humanName);
      proto[methodName].overloadTable[argCount - 2] = unboundTypesHandler;
    }
    whenDependentTypesAreResolved([], rawArgTypes, function(argTypes) {
      var memberFunction = craftInvokerFunction(
        humanName,
        argTypes,
        classType,
        rawInvoker,
        context
      );
      if (undefined === proto[methodName].overloadTable) {
        proto[methodName] = memberFunction;
      } else {
        proto[methodName].overloadTable[argCount - 2] = memberFunction;
      }
      return [];
    });
    return [];
  });
}
var ___dso_handle = allocate(1, 'i32*', ALLOC_STATIC);
embind_init_charCodes();
BindingError = Module['BindingError'] = extendError(Error, 'BindingError');
InternalError = Module['InternalError'] = extendError(Error, 'InternalError');
FS.staticInit();
__ATINIT__.unshift({
  func: function() {
    if (!Module['noFSInit'] && !FS.init.initialized) FS.init();
  }
});
__ATMAIN__.push({
  func: function() {
    FS.ignorePermissions = false;
  }
});
__ATEXIT__.push({
  func: function() {
    FS.quit();
  }
});
Module['FS_createFolder'] = FS.createFolder;
Module['FS_createPath'] = FS.createPath;
Module['FS_createDataFile'] = FS.createDataFile;
Module['FS_createPreloadedFile'] = FS.createPreloadedFile;
Module['FS_createLazyFile'] = FS.createLazyFile;
Module['FS_createLink'] = FS.createLink;
Module['FS_createDevice'] = FS.createDevice;
___errno_state = Runtime.staticAlloc(4);
HEAP32[___errno_state >> 2] = 0;
__ATINIT__.unshift({
  func: function() {
    TTY.init();
  }
});
__ATEXIT__.push({
  func: function() {
    TTY.shutdown();
  }
});
TTY.utf8 = new Runtime.UTF8Processor();
if (ENVIRONMENT_IS_NODE) {
  var fs = require('fs');
  NODEFS.staticInit();
}
_fputc.ret = allocate([0], 'i8', ALLOC_STATIC);
__ATINIT__.push({
  func: function() {
    SOCKFS.root = FS.mount(SOCKFS, {}, null);
  }
});
init_emval();
init_ClassHandle();
init_RegisteredPointer();
init_embind();
UnboundTypeError = Module['UnboundTypeError'] = extendError(Error, 'UnboundTypeError');
_fgetc.ret = allocate([0], 'i8', ALLOC_STATIC);
Module['requestFullScreen'] = function Module_requestFullScreen(lockPointer, resizeCanvas) {
  Browser.requestFullScreen(lockPointer, resizeCanvas);
};
Module['requestAnimationFrame'] = function Module_requestAnimationFrame(func) {
  Browser.requestAnimationFrame(func);
};
Module['setCanvasSize'] = function Module_setCanvasSize(width, height, noUpdates) {
  Browser.setCanvasSize(width, height, noUpdates);
};
Module['pauseMainLoop'] = function Module_pauseMainLoop() {
  Browser.mainLoop.pause();
};
Module['resumeMainLoop'] = function Module_resumeMainLoop() {
  Browser.mainLoop.resume();
};
Module['getUserMedia'] = function Module_getUserMedia() {
  Browser.getUserMedia();
};
STACK_BASE = STACKTOP = Runtime.alignMemory(STATICTOP);
staticSealed = true;
STACK_MAX = STACK_BASE + TOTAL_STACK;
DYNAMIC_BASE = DYNAMICTOP = Runtime.alignMemory(STACK_MAX);
assert(DYNAMIC_BASE < TOTAL_MEMORY, 'TOTAL_MEMORY not big enough for stack');
var ctlz_i8 = allocate(
  [
    8,
    7,
    6,
    6,
    5,
    5,
    5,
    5,
    4,
    4,
    4,
    4,
    4,
    4,
    4,
    4,
    3,
    3,
    3,
    3,
    3,
    3,
    3,
    3,
    3,
    3,
    3,
    3,
    3,
    3,
    3,
    3,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    2,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0
  ],
  'i8',
  ALLOC_DYNAMIC
);
var cttz_i8 = allocate(
  [
    8,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    3,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    4,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    3,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    5,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    3,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    4,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    3,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    6,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    3,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    4,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    3,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    5,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    3,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    4,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    3,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    7,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    3,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    4,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    3,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    5,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    3,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    4,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    3,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    6,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    3,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    4,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    3,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    5,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    3,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    4,
    0,
    1,
    0,
    2,
    0,
    1,
    0,
    3,
    0,
    1,
    0,
    2,
    0,
    1,
    0
  ],
  'i8',
  ALLOC_DYNAMIC
);
function invoke_iiii(index, a1, a2, a3) {
  try {
    return Module['dynCall_iiii'](index, a1, a2, a3);
  } catch (e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm['setThrew'](1, 0);
  }
}
function invoke_viiiiiii(index, a1, a2, a3, a4, a5, a6, a7) {
  try {
    Module['dynCall_viiiiiii'](index, a1, a2, a3, a4, a5, a6, a7);
  } catch (e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm['setThrew'](1, 0);
  }
}
function invoke_viiiii(index, a1, a2, a3, a4, a5) {
  try {
    Module['dynCall_viiiii'](index, a1, a2, a3, a4, a5);
  } catch (e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm['setThrew'](1, 0);
  }
}
function invoke_i(index) {
  try {
    return Module['dynCall_i'](index);
  } catch (e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm['setThrew'](1, 0);
  }
}
function invoke_vi(index, a1) {
  try {
    Module['dynCall_vi'](index, a1);
  } catch (e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm['setThrew'](1, 0);
  }
}
function invoke_vii(index, a1, a2) {
  try {
    Module['dynCall_vii'](index, a1, a2);
  } catch (e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm['setThrew'](1, 0);
  }
}
function invoke_viiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
  try {
    Module['dynCall_viiiiiiiii'](index, a1, a2, a3, a4, a5, a6, a7, a8, a9);
  } catch (e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm['setThrew'](1, 0);
  }
}
function invoke_ii(index, a1) {
  try {
    return Module['dynCall_ii'](index, a1);
  } catch (e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm['setThrew'](1, 0);
  }
}
function invoke_viiiiiid(index, a1, a2, a3, a4, a5, a6, a7) {
  try {
    Module['dynCall_viiiiiid'](index, a1, a2, a3, a4, a5, a6, a7);
  } catch (e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm['setThrew'](1, 0);
  }
}
function invoke_viii(index, a1, a2, a3) {
  try {
    Module['dynCall_viii'](index, a1, a2, a3);
  } catch (e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm['setThrew'](1, 0);
  }
}
function invoke_viiiiid(index, a1, a2, a3, a4, a5, a6) {
  try {
    Module['dynCall_viiiiid'](index, a1, a2, a3, a4, a5, a6);
  } catch (e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm['setThrew'](1, 0);
  }
}
function invoke_v(index) {
  try {
    Module['dynCall_v'](index);
  } catch (e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm['setThrew'](1, 0);
  }
}
function invoke_iiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8) {
  try {
    return Module['dynCall_iiiiiiiii'](index, a1, a2, a3, a4, a5, a6, a7, a8);
  } catch (e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm['setThrew'](1, 0);
  }
}
function invoke_iiiii(index, a1, a2, a3, a4) {
  try {
    return Module['dynCall_iiiii'](index, a1, a2, a3, a4);
  } catch (e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm['setThrew'](1, 0);
  }
}
function invoke_viiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8) {
  try {
    Module['dynCall_viiiiiiii'](index, a1, a2, a3, a4, a5, a6, a7, a8);
  } catch (e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm['setThrew'](1, 0);
  }
}
function invoke_viiiiii(index, a1, a2, a3, a4, a5, a6) {
  try {
    Module['dynCall_viiiiii'](index, a1, a2, a3, a4, a5, a6);
  } catch (e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm['setThrew'](1, 0);
  }
}
function invoke_iii(index, a1, a2) {
  try {
    return Module['dynCall_iii'](index, a1, a2);
  } catch (e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm['setThrew'](1, 0);
  }
}
function invoke_iiiiii(index, a1, a2, a3, a4, a5) {
  try {
    return Module['dynCall_iiiiii'](index, a1, a2, a3, a4, a5);
  } catch (e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm['setThrew'](1, 0);
  }
}
function invoke_viiii(index, a1, a2, a3, a4) {
  try {
    Module['dynCall_viiii'](index, a1, a2, a3, a4);
  } catch (e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm['setThrew'](1, 0);
  }
}
Module.asmGlobalArg = {
  Math: Math,
  Int8Array: Int8Array,
  Int16Array: Int16Array,
  Int32Array: Int32Array,
  Uint8Array: Uint8Array,
  Uint16Array: Uint16Array,
  Uint32Array: Uint32Array,
  Float32Array: Float32Array,
  Float64Array: Float64Array
};
Module.asmLibraryArg = {
  abort: abort,
  assert: assert,
  min: Math_min,
  invoke_iiii: invoke_iiii,
  invoke_viiiiiii: invoke_viiiiiii,
  invoke_viiiii: invoke_viiiii,
  invoke_i: invoke_i,
  invoke_vi: invoke_vi,
  invoke_vii: invoke_vii,
  invoke_viiiiiiiii: invoke_viiiiiiiii,
  invoke_ii: invoke_ii,
  invoke_viiiiiid: invoke_viiiiiid,
  invoke_viii: invoke_viii,
  invoke_viiiiid: invoke_viiiiid,
  invoke_v: invoke_v,
  invoke_iiiiiiiii: invoke_iiiiiiiii,
  invoke_iiiii: invoke_iiiii,
  invoke_viiiiiiii: invoke_viiiiiiii,
  invoke_viiiiii: invoke_viiiiii,
  invoke_iii: invoke_iii,
  invoke_iiiiii: invoke_iiiiii,
  invoke_viiii: invoke_viiii,
  _fabs: _fabs,
  floatReadValueFromPointer: floatReadValueFromPointer,
  simpleReadValueFromPointer: simpleReadValueFromPointer,
  throwInternalError: throwInternalError,
  get_first_emval: get_first_emval,
  ___cxa_guard_acquire: ___cxa_guard_acquire,
  _fmodl: _fmodl,
  ___assert_fail: ___assert_fail,
  __ZSt18uncaught_exceptionv: __ZSt18uncaught_exceptionv,
  ClassHandle: ClassHandle,
  getShiftFromSize: getShiftFromSize,
  __addDays: __addDays,
  _emscripten_set_main_loop_timing: _emscripten_set_main_loop_timing,
  _sbrk: _sbrk,
  ___cxa_begin_catch: ___cxa_begin_catch,
  _emscripten_memcpy_big: _emscripten_memcpy_big,
  runDestructor: runDestructor,
  _sysconf: _sysconf,
  throwInstanceAlreadyDeleted: throwInstanceAlreadyDeleted,
  __embind_register_std_string: __embind_register_std_string,
  genericPointerToWireType: genericPointerToWireType,
  init_RegisteredPointer: init_RegisteredPointer,
  ClassHandle_isAliasOf: ClassHandle_isAliasOf,
  _fileno: _fileno,
  flushPendingDeletes: flushPendingDeletes,
  _fread: _fread,
  makeClassHandle: makeClassHandle,
  whenDependentTypesAreResolved: whenDependentTypesAreResolved,
  _write: _write,
  __isLeapYear: __isLeapYear,
  __embind_register_class_constructor: __embind_register_class_constructor,
  RegisteredPointer_deleteObject: RegisteredPointer_deleteObject,
  ___cxa_atexit: ___cxa_atexit,
  init_ClassHandle: init_ClassHandle,
  _catclose: _catclose,
  constNoSmartPtrRawPointerToWireType: constNoSmartPtrRawPointerToWireType,
  getLiveInheritedInstances: getLiveInheritedInstances,
  _send: _send,
  RegisteredClass: RegisteredClass,
  ___cxa_find_matching_catch: ___cxa_find_matching_catch,
  __embind_register_emval: __embind_register_emval,
  _strerror_r: _strerror_r,
  __reallyNegative: __reallyNegative,
  ___setErrNo: ___setErrNo,
  ___ctype_tolower_loc: ___ctype_tolower_loc,
  _newlocale: _newlocale,
  __embind_register_bool: __embind_register_bool,
  ___resumeException: ___resumeException,
  _freelocale: _freelocale,
  createNamedFunction: createNamedFunction,
  embind_init_charCodes: embind_init_charCodes,
  __emval_decref: __emval_decref,
  _pthread_once: _pthread_once,
  _pthread_mutex_unlock: _pthread_mutex_unlock,
  ___ctype_toupper_loc: ___ctype_toupper_loc,
  init_embind: init_embind,
  ClassHandle_clone: ClassHandle_clone,
  heap32VectorToArray: heap32VectorToArray,
  ClassHandle_delete: ClassHandle_delete,
  _mkport: _mkport,
  _read: _read,
  RegisteredPointer_destructor: RegisteredPointer_destructor,
  _fwrite: _fwrite,
  _time: _time,
  _fprintf: _fprintf,
  new_: new_,
  downcastPointer: downcastPointer,
  _catopen: _catopen,
  replacePublicSymbol: replacePublicSymbol,
  __embind_register_class: __embind_register_class,
  ClassHandle_deleteLater: ClassHandle_deleteLater,
  ___ctype_b_loc: ___ctype_b_loc,
  _fmod: _fmod,
  ClassHandle_isDeleted: ClassHandle_isDeleted,
  _vfprintf: _vfprintf,
  __embind_register_integer: __embind_register_integer,
  ___cxa_allocate_exception: ___cxa_allocate_exception,
  _pwrite: _pwrite,
  _uselocale: _uselocale,
  _embind_repr: _embind_repr,
  _strftime: _strftime,
  RegisteredPointer: RegisteredPointer,
  _pthread_mutex_destroy: _pthread_mutex_destroy,
  runDestructors: runDestructors,
  makeLegalFunctionName: makeLegalFunctionName,
  _pthread_key_create: _pthread_key_create,
  upcastPointer: upcastPointer,
  init_emval: init_emval,
  _pthread_cond_broadcast: _pthread_cond_broadcast,
  shallowCopyInternalPointer: shallowCopyInternalPointer,
  nonConstNoSmartPtrRawPointerToWireType: nonConstNoSmartPtrRawPointerToWireType,
  _recv: _recv,
  _copysign: _copysign,
  registerType: registerType,
  _abort: _abort,
  throwBindingError: throwBindingError,
  exposePublicSymbol: exposePublicSymbol,
  RegisteredPointer_fromWireType: RegisteredPointer_fromWireType,
  _pthread_getspecific: _pthread_getspecific,
  _pthread_cond_wait: _pthread_cond_wait,
  __embind_register_memory_view: __embind_register_memory_view,
  getInheritedInstance: getInheritedInstance,
  setDelayFunction: setDelayFunction,
  ___gxx_personality_v0: ___gxx_personality_v0,
  extendError: extendError,
  _ungetc: _ungetc,
  ensureOverloadTable: ensureOverloadTable,
  __embind_register_void: __embind_register_void,
  _fflush: _fflush,
  _strftime_l: _strftime_l,
  _pthread_mutex_lock: _pthread_mutex_lock,
  RegisteredPointer_getPointee: RegisteredPointer_getPointee,
  __emval_register: __emval_register,
  _catgets: _catgets,
  __embind_register_std_wstring: __embind_register_std_wstring,
  __embind_register_class_function: __embind_register_class_function,
  throwUnboundTypeError: throwUnboundTypeError,
  __arraySum: __arraySum,
  _calloc: _calloc,
  readLatin1String: readLatin1String,
  craftInvokerFunction: craftInvokerFunction,
  getBasestPointer: getBasestPointer,
  _pread: _pread,
  getInheritedInstanceCount: getInheritedInstanceCount,
  __embind_register_float: __embind_register_float,
  integerReadValueFromPointer: integerReadValueFromPointer,
  _getc: _getc,
  _emscripten_set_main_loop: _emscripten_set_main_loop,
  ___errno_location: ___errno_location,
  ___cxa_guard_release: ___cxa_guard_release,
  _pthread_setspecific: _pthread_setspecific,
  _fgetc: _fgetc,
  _fputc: _fputc,
  ___cxa_throw: ___cxa_throw,
  _copysignl: _copysignl,
  count_emval_handles: count_emval_handles,
  requireFunction: requireFunction,
  _strerror: _strerror,
  __formatString: __formatString,
  _atexit: _atexit,
  STACKTOP: STACKTOP,
  STACK_MAX: STACK_MAX,
  tempDoublePtr: tempDoublePtr,
  ABORT: ABORT,
  cttz_i8: cttz_i8,
  ctlz_i8: ctlz_i8,
  NaN: NaN,
  Infinity: Infinity,
  ___dso_handle: ___dso_handle,
  _stderr: _stderr,
  _stdin: _stdin,
  _stdout: _stdout
}; // EMSCRIPTEN_START_ASM
var asm = (function(global, env, buffer) {
  'use asm';
  var a = new global.Int8Array(buffer);
  var b = new global.Int16Array(buffer);
  var c = new global.Int32Array(buffer);
  var d = new global.Uint8Array(buffer);
  var e = new global.Uint16Array(buffer);
  var f = new global.Uint32Array(buffer);
  var g = new global.Float32Array(buffer);
  var h = new global.Float64Array(buffer);
  var i = env.STACKTOP | 0;
  var j = env.STACK_MAX | 0;
  var k = env.tempDoublePtr | 0;
  var l = env.ABORT | 0;
  var m = env.cttz_i8 | 0;
  var n = env.ctlz_i8 | 0;
  var o = env.___dso_handle | 0;
  var p = env._stderr | 0;
  var q = env._stdin | 0;
  var r = env._stdout | 0;
  var s = 0;
  var t = 0;
  var u = 0;
  var v = 0;
  var w = +env.NaN,
    x = +env.Infinity;
  var y = 0,
    z = 0,
    A = 0,
    B = 0,
    C = 0.0,
    D = 0,
    E = 0,
    F = 0,
    G = 0.0;
  var H = 0;
  var I = 0;
  var J = 0;
  var K = 0;
  var L = 0;
  var M = 0;
  var N = 0;
  var O = 0;
  var P = 0;
  var Q = 0;
  var R = global.Math.floor;
  var S = global.Math.abs;
  var T = global.Math.sqrt;
  var U = global.Math.pow;
  var V = global.Math.cos;
  var W = global.Math.sin;
  var X = global.Math.tan;
  var Y = global.Math.acos;
  var Z = global.Math.asin;
  var _ = global.Math.atan;
  var $ = global.Math.atan2;
  var aa = global.Math.exp;
  var ba = global.Math.log;
  var ca = global.Math.ceil;
  var da = global.Math.imul;
  var ea = env.abort;
  var fa = env.assert;
  var ga = env.min;
  var ha = env.invoke_iiii;
  var ia = env.invoke_viiiiiii;
  var ja = env.invoke_viiiii;
  var ka = env.invoke_i;
  var la = env.invoke_vi;
  var ma = env.invoke_vii;
  var na = env.invoke_viiiiiiiii;
  var oa = env.invoke_ii;
  var pa = env.invoke_viiiiiid;
  var qa = env.invoke_viii;
  var ra = env.invoke_viiiiid;
  var sa = env.invoke_v;
  var ta = env.invoke_iiiiiiiii;
  var ua = env.invoke_iiiii;
  var va = env.invoke_viiiiiiii;
  var wa = env.invoke_viiiiii;
  var xa = env.invoke_iii;
  var ya = env.invoke_iiiiii;
  var za = env.invoke_viiii;
  var Aa = env._fabs;
  var Ba = env.floatReadValueFromPointer;
  var Ca = env.simpleReadValueFromPointer;
  var Da = env.throwInternalError;
  var Ea = env.get_first_emval;
  var Fa = env.___cxa_guard_acquire;
  var Ga = env._fmodl;
  var Ha = env.___assert_fail;
  var Ia = env.__ZSt18uncaught_exceptionv;
  var Ja = env.ClassHandle;
  var Ka = env.getShiftFromSize;
  var La = env.__addDays;
  var Ma = env._emscripten_set_main_loop_timing;
  var Na = env._sbrk;
  var Oa = env.___cxa_begin_catch;
  var Pa = env._emscripten_memcpy_big;
  var Qa = env.runDestructor;
  var Ra = env._sysconf;
  var Sa = env.throwInstanceAlreadyDeleted;
  var Ta = env.__embind_register_std_string;
  var Ua = env.genericPointerToWireType;
  var Va = env.init_RegisteredPointer;
  var Wa = env.ClassHandle_isAliasOf;
  var Xa = env._fileno;
  var Ya = env.flushPendingDeletes;
  var Za = env._fread;
  var _a = env.makeClassHandle;
  var $a = env.whenDependentTypesAreResolved;
  var ab = env._write;
  var bb = env.__isLeapYear;
  var cb = env.__embind_register_class_constructor;
  var db = env.RegisteredPointer_deleteObject;
  var eb = env.___cxa_atexit;
  var fb = env.init_ClassHandle;
  var gb = env._catclose;
  var hb = env.constNoSmartPtrRawPointerToWireType;
  var ib = env.getLiveInheritedInstances;
  var jb = env._send;
  var kb = env.RegisteredClass;
  var lb = env.___cxa_find_matching_catch;
  var mb = env.__embind_register_emval;
  var nb = env._strerror_r;
  var ob = env.__reallyNegative;
  var pb = env.___setErrNo;
  var qb = env.___ctype_tolower_loc;
  var rb = env._newlocale;
  var sb = env.__embind_register_bool;
  var tb = env.___resumeException;
  var ub = env._freelocale;
  var vb = env.createNamedFunction;
  var wb = env.embind_init_charCodes;
  var xb = env.__emval_decref;
  var yb = env._pthread_once;
  var zb = env._pthread_mutex_unlock;
  var Ab = env.___ctype_toupper_loc;
  var Bb = env.init_embind;
  var Cb = env.ClassHandle_clone;
  var Db = env.heap32VectorToArray;
  var Eb = env.ClassHandle_delete;
  var Fb = env._mkport;
  var Gb = env._read;
  var Hb = env.RegisteredPointer_destructor;
  var Ib = env._fwrite;
  var Jb = env._time;
  var Kb = env._fprintf;
  var Lb = env.new_;
  var Mb = env.downcastPointer;
  var Nb = env._catopen;
  var Ob = env.replacePublicSymbol;
  var Pb = env.__embind_register_class;
  var Qb = env.ClassHandle_deleteLater;
  var Rb = env.___ctype_b_loc;
  var Sb = env._fmod;
  var Tb = env.ClassHandle_isDeleted;
  var Ub = env._vfprintf;
  var Vb = env.__embind_register_integer;
  var Wb = env.___cxa_allocate_exception;
  var Xb = env._pwrite;
  var Yb = env._uselocale;
  var Zb = env._embind_repr;
  var _b = env._strftime;
  var $b = env.RegisteredPointer;
  var ac = env._pthread_mutex_destroy;
  var bc = env.runDestructors;
  var cc = env.makeLegalFunctionName;
  var dc = env._pthread_key_create;
  var ec = env.upcastPointer;
  var fc = env.init_emval;
  var gc = env._pthread_cond_broadcast;
  var hc = env.shallowCopyInternalPointer;
  var ic = env.nonConstNoSmartPtrRawPointerToWireType;
  var jc = env._recv;
  var kc = env._copysign;
  var lc = env.registerType;
  var mc = env._abort;
  var nc = env.throwBindingError;
  var oc = env.exposePublicSymbol;
  var pc = env.RegisteredPointer_fromWireType;
  var qc = env._pthread_getspecific;
  var rc = env._pthread_cond_wait;
  var sc = env.__embind_register_memory_view;
  var tc = env.getInheritedInstance;
  var uc = env.setDelayFunction;
  var vc = env.___gxx_personality_v0;
  var wc = env.extendError;
  var xc = env._ungetc;
  var yc = env.ensureOverloadTable;
  var zc = env.__embind_register_void;
  var Ac = env._fflush;
  var Bc = env._strftime_l;
  var Cc = env._pthread_mutex_lock;
  var Dc = env.RegisteredPointer_getPointee;
  var Ec = env.__emval_register;
  var Fc = env._catgets;
  var Gc = env.__embind_register_std_wstring;
  var Hc = env.__embind_register_class_function;
  var Ic = env.throwUnboundTypeError;
  var Jc = env.__arraySum;
  var Kc = env._calloc;
  var Lc = env.readLatin1String;
  var Mc = env.craftInvokerFunction;
  var Nc = env.getBasestPointer;
  var Oc = env._pread;
  var Pc = env.getInheritedInstanceCount;
  var Qc = env.__embind_register_float;
  var Rc = env.integerReadValueFromPointer;
  var Sc = env._getc;
  var Tc = env._emscripten_set_main_loop;
  var Uc = env.___errno_location;
  var Vc = env.___cxa_guard_release;
  var Wc = env._pthread_setspecific;
  var Xc = env._fgetc;
  var Yc = env._fputc;
  var Zc = env.___cxa_throw;
  var _c = env._copysignl;
  var $c = env.count_emval_handles;
  var ad = env.requireFunction;
  var bd = env._strerror;
  var cd = env.__formatString;
  var dd = env._atexit;
  var ed = 0.0;
  // EMSCRIPTEN_START_FUNCS
  function Oh(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0;
    b = i;
    c[a >> 2] = 16312;
    a = c[(a + 4) >> 2] | 0;
    e = (a + 4) | 0;
    d = c[e >> 2] | 0;
    c[e >> 2] = d + -1;
    if (d) {
      i = b;
      return;
    }
    jd[c[((c[a >> 2] | 0) + 8) >> 2] & 255](a);
    i = b;
    return;
  }
  function Ph(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0,
      f = 0;
    b = i;
    c[a >> 2] = 16312;
    d = c[(a + 4) >> 2] | 0;
    f = (d + 4) | 0;
    e = c[f >> 2] | 0;
    c[f >> 2] = e + -1;
    if (e) {
      Uq(a);
      i = b;
      return;
    }
    jd[c[((c[d >> 2] | 0) + 8) >> 2] & 255](d);
    Uq(a);
    i = b;
    return;
  }
  function Qh(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0;
    e = i;
    md[c[((c[b >> 2] | 0) + 24) >> 2] & 127](b) | 0;
    d = Sn(c[d >> 2] | 0, 19144) | 0;
    c[(b + 36) >> 2] = d;
    a[(b + 44) >> 0] = (md[c[((c[d >> 2] | 0) + 28) >> 2] & 127](d) | 0) & 1;
    i = e;
    return;
  }
  function Rh(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0;
    b = i;
    i = (i + 16) | 0;
    g = (b + 8) | 0;
    d = b;
    e = (a + 36) | 0;
    f = (a + 40) | 0;
    h = (g + 8) | 0;
    j = g;
    a = (a + 32) | 0;
    while (1) {
      k = c[e >> 2] | 0;
      k = wd[c[((c[k >> 2] | 0) + 20) >> 2] & 15](k, c[f >> 2] | 0, g, h, d) | 0;
      l = ((c[d >> 2] | 0) - j) | 0;
      if ((Ib(g | 0, 1, l | 0, c[a >> 2] | 0) | 0) != (l | 0)) {
        e = -1;
        d = 5;
        break;
      }
      if ((k | 0) == 2) {
        e = -1;
        d = 5;
        break;
      } else if ((k | 0) != 1) {
        d = 4;
        break;
      }
    }
    if ((d | 0) == 4) {
      l = (((Ac(c[a >> 2] | 0) | 0) != 0) << 31) >> 31;
      i = b;
      return l | 0;
    } else if ((d | 0) == 5) {
      i = b;
      return e | 0;
    }
    return 0;
  }
  function Sh(b, d, e) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    var f = 0,
      g = 0;
    f = i;
    if (a[(b + 44) >> 0] | 0) {
      g = Ib(d | 0, 4, e | 0, c[(b + 32) >> 2] | 0) | 0;
      i = f;
      return g | 0;
    }
    if ((e | 0) > 0) g = 0;
    else {
      g = 0;
      i = f;
      return g | 0;
    }
    while (1) {
      if ((vd[c[((c[b >> 2] | 0) + 52) >> 2] & 63](b, c[d >> 2] | 0) | 0) == -1) {
        e = 6;
        break;
      }
      g = (g + 1) | 0;
      if ((g | 0) < (e | 0)) d = (d + 4) | 0;
      else {
        e = 6;
        break;
      }
    }
    if ((e | 0) == 6) {
      i = f;
      return g | 0;
    }
    return 0;
  }
  function Th(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0;
    e = i;
    i = (i + 32) | 0;
    k = (e + 16) | 0;
    p = (e + 8) | 0;
    j = (e + 4) | 0;
    h = e;
    f = (d | 0) == -1;
    a: do
      if (!f) {
        c[p >> 2] = d;
        if (a[(b + 44) >> 0] | 0) {
          if ((Ib(p | 0, 4, 1, c[(b + 32) >> 2] | 0) | 0) == 1) break;
          else d = -1;
          i = e;
          return d | 0;
        }
        c[j >> 2] = k;
        l = (p + 4) | 0;
        n = (b + 36) | 0;
        o = (b + 40) | 0;
        g = (k + 8) | 0;
        m = k;
        b = (b + 32) | 0;
        while (1) {
          q = c[n >> 2] | 0;
          q = rd[c[((c[q >> 2] | 0) + 12) >> 2] & 15](q, c[o >> 2] | 0, p, l, h, k, g, j) | 0;
          if ((c[h >> 2] | 0) == (p | 0)) {
            d = -1;
            g = 12;
            break;
          }
          if ((q | 0) == 3) {
            g = 7;
            break;
          }
          r = (q | 0) == 1;
          if (q >>> 0 >= 2) {
            d = -1;
            g = 12;
            break;
          }
          q = ((c[j >> 2] | 0) - m) | 0;
          if ((Ib(k | 0, 1, q | 0, c[b >> 2] | 0) | 0) != (q | 0)) {
            d = -1;
            g = 12;
            break;
          }
          if (r) p = r ? c[h >> 2] | 0 : p;
          else break a;
        }
        if ((g | 0) == 7) {
          if ((Ib(p | 0, 1, 1, c[b >> 2] | 0) | 0) == 1) break;
          else d = -1;
          i = e;
          return d | 0;
        } else if ((g | 0) == 12) {
          i = e;
          return d | 0;
        }
      }
    while (0);
    r = f ? 0 : d;
    i = e;
    return r | 0;
  }
  function Uh(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0;
    b = i;
    c[a >> 2] = 16312;
    a = c[(a + 4) >> 2] | 0;
    e = (a + 4) | 0;
    d = c[e >> 2] | 0;
    c[e >> 2] = d + -1;
    if (d) {
      i = b;
      return;
    }
    jd[c[((c[a >> 2] | 0) + 8) >> 2] & 255](a);
    i = b;
    return;
  }
  function Vh(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0,
      f = 0;
    b = i;
    c[a >> 2] = 16312;
    d = c[(a + 4) >> 2] | 0;
    f = (d + 4) | 0;
    e = c[f >> 2] | 0;
    c[f >> 2] = e + -1;
    if (e) {
      Uq(a);
      i = b;
      return;
    }
    jd[c[((c[d >> 2] | 0) + 8) >> 2] & 255](d);
    Uq(a);
    i = b;
    return;
  }
  function Wh(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0;
    e = i;
    g = Sn(c[d >> 2] | 0, 19144) | 0;
    f = (b + 36) | 0;
    c[f >> 2] = g;
    d = (b + 44) | 0;
    c[d >> 2] = md[c[((c[g >> 2] | 0) + 24) >> 2] & 127](g) | 0;
    f = c[f >> 2] | 0;
    a[(b + 53) >> 0] = (md[c[((c[f >> 2] | 0) + 28) >> 2] & 127](f) | 0) & 1;
    if ((c[d >> 2] | 0) > 8) dn(15216);
    else {
      i = e;
      return;
    }
  }
  function Xh(a) {
    a = a | 0;
    var b = 0;
    b = i;
    a = _h(a, 0) | 0;
    i = b;
    return a | 0;
  }
  function Yh(a) {
    a = a | 0;
    var b = 0;
    b = i;
    a = _h(a, 1) | 0;
    i = b;
    return a | 0;
  }
  function Zh(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0;
    e = i;
    i = (i + 32) | 0;
    j = (e + 16) | 0;
    f = (e + 8) | 0;
    l = (e + 4) | 0;
    k = e;
    g = (b + 52) | 0;
    m = (a[g >> 0] | 0) != 0;
    if ((d | 0) == -1) {
      if (m) {
        m = -1;
        i = e;
        return m | 0;
      }
      m = c[(b + 48) >> 2] | 0;
      a[g >> 0] = ((m | 0) != -1) & 1;
      i = e;
      return m | 0;
    }
    h = (b + 48) | 0;
    a: do
      if (m) {
        c[l >> 2] = c[h >> 2];
        m = c[(b + 36) >> 2] | 0;
        k =
          rd[c[((c[m >> 2] | 0) + 12) >> 2] & 15](
            m,
            c[(b + 40) >> 2] | 0,
            l,
            (l + 4) | 0,
            k,
            j,
            (j + 8) | 0,
            f
          ) | 0;
        if (((k | 0) == 1) | ((k | 0) == 2)) {
          m = -1;
          i = e;
          return m | 0;
        } else if ((k | 0) == 3) {
          a[j >> 0] = c[h >> 2];
          c[f >> 2] = j + 1;
        }
        b = (b + 32) | 0;
        while (1) {
          k = c[f >> 2] | 0;
          if (k >>> 0 <= j >>> 0) break a;
          m = (k + -1) | 0;
          c[f >> 2] = m;
          if ((xc(a[m >> 0] | 0, c[b >> 2] | 0) | 0) == -1) {
            f = -1;
            break;
          }
        }
        i = e;
        return f | 0;
      }
    while (0);
    c[h >> 2] = d;
    a[g >> 0] = 1;
    m = d;
    i = e;
    return m | 0;
  }
  function _h(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0;
    e = i;
    i = (i + 32) | 0;
    g = (e + 16) | 0;
    j = (e + 8) | 0;
    m = (e + 4) | 0;
    l = e;
    n = (b + 52) | 0;
    if (a[n >> 0] | 0) {
      f = (b + 48) | 0;
      g = c[f >> 2] | 0;
      if (!d) {
        v = g;
        i = e;
        return v | 0;
      }
      c[f >> 2] = -1;
      a[n >> 0] = 0;
      v = g;
      i = e;
      return v | 0;
    }
    s = c[(b + 44) >> 2] | 0;
    s = (s | 0) > 1 ? s : 1;
    a: do
      if ((s | 0) > 0) {
        p = (b + 32) | 0;
        n = 0;
        while (1) {
          o = Sc(c[p >> 2] | 0) | 0;
          if ((o | 0) == -1) {
            h = -1;
            break;
          }
          a[(g + n) >> 0] = o;
          n = (n + 1) | 0;
          if ((n | 0) >= (s | 0)) break a;
        }
        i = e;
        return h | 0;
      }
    while (0);
    b: do
      if (!(a[(b + 53) >> 0] | 0)) {
        p = (b + 40) | 0;
        q = (b + 36) | 0;
        n = (j + 4) | 0;
        o = (b + 32) | 0;
        while (1) {
          v = c[p >> 2] | 0;
          u = v;
          t = c[u >> 2] | 0;
          u = c[(u + 4) >> 2] | 0;
          w = c[q >> 2] | 0;
          r = (g + s) | 0;
          v = rd[c[((c[w >> 2] | 0) + 16) >> 2] & 15](w, v, g, r, m, j, n, l) | 0;
          if ((v | 0) == 3) {
            f = 14;
            break;
          } else if ((v | 0) == 2) {
            h = -1;
            f = 22;
            break;
          } else if ((v | 0) != 1) {
            k = s;
            break b;
          }
          w = c[p >> 2] | 0;
          c[w >> 2] = t;
          c[(w + 4) >> 2] = u;
          if ((s | 0) == 8) {
            h = -1;
            f = 22;
            break;
          }
          t = Sc(c[o >> 2] | 0) | 0;
          if ((t | 0) == -1) {
            h = -1;
            f = 22;
            break;
          }
          a[r >> 0] = t;
          s = (s + 1) | 0;
        }
        if ((f | 0) == 14) {
          c[j >> 2] = a[g >> 0];
          k = s;
          break;
        } else if ((f | 0) == 22) {
          i = e;
          return h | 0;
        }
      } else {
        c[j >> 2] = a[g >> 0];
        k = s;
      }
    while (0);
    if (d) {
      w = c[j >> 2] | 0;
      c[(b + 48) >> 2] = w;
      i = e;
      return w | 0;
    }
    d = (b + 32) | 0;
    while (1) {
      if ((k | 0) <= 0) break;
      k = (k + -1) | 0;
      if ((xc(a[(g + k) >> 0] | 0, c[d >> 2] | 0) | 0) == -1) {
        h = -1;
        f = 22;
        break;
      }
    }
    if ((f | 0) == 22) {
      i = e;
      return h | 0;
    }
    w = c[j >> 2] | 0;
    i = e;
    return w | 0;
  }
  function $h(b, d, e) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    var f = 0,
      g = 0,
      h = 0,
      j = 0;
    f = i;
    c[b >> 2] = 16248;
    Qn((b + 4) | 0);
    g = (b + 8) | 0;
    c[(g + 0) >> 2] = 0;
    c[(g + 4) >> 2] = 0;
    c[(g + 8) >> 2] = 0;
    c[(g + 12) >> 2] = 0;
    c[(g + 16) >> 2] = 0;
    c[(g + 20) >> 2] = 0;
    c[b >> 2] = 15264;
    c[(b + 32) >> 2] = d;
    g = c[(b + 4) >> 2] | 0;
    j = (g + 4) | 0;
    c[j >> 2] = (c[j >> 2] | 0) + 1;
    d = Sn(g, 19136) | 0;
    h = c[j >> 2] | 0;
    c[j >> 2] = h + -1;
    if (!h) jd[c[((c[g >> 2] | 0) + 8) >> 2] & 255](g);
    c[(b + 36) >> 2] = d;
    c[(b + 40) >> 2] = e;
    a[(b + 44) >> 0] = (md[c[((c[d >> 2] | 0) + 28) >> 2] & 127](d) | 0) & 1;
    i = f;
    return;
  }
  function ai(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0;
    b = i;
    c[a >> 2] = 16248;
    a = c[(a + 4) >> 2] | 0;
    e = (a + 4) | 0;
    d = c[e >> 2] | 0;
    c[e >> 2] = d + -1;
    if (d) {
      i = b;
      return;
    }
    jd[c[((c[a >> 2] | 0) + 8) >> 2] & 255](a);
    i = b;
    return;
  }
  function bi(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0,
      f = 0;
    b = i;
    c[a >> 2] = 16248;
    d = c[(a + 4) >> 2] | 0;
    f = (d + 4) | 0;
    e = c[f >> 2] | 0;
    c[f >> 2] = e + -1;
    if (e) {
      Uq(a);
      i = b;
      return;
    }
    jd[c[((c[d >> 2] | 0) + 8) >> 2] & 255](d);
    Uq(a);
    i = b;
    return;
  }
  function ci(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0;
    e = i;
    md[c[((c[b >> 2] | 0) + 24) >> 2] & 127](b) | 0;
    d = Sn(c[d >> 2] | 0, 19136) | 0;
    c[(b + 36) >> 2] = d;
    a[(b + 44) >> 0] = (md[c[((c[d >> 2] | 0) + 28) >> 2] & 127](d) | 0) & 1;
    i = e;
    return;
  }
  function di(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0;
    b = i;
    i = (i + 16) | 0;
    g = (b + 8) | 0;
    d = b;
    e = (a + 36) | 0;
    f = (a + 40) | 0;
    h = (g + 8) | 0;
    j = g;
    a = (a + 32) | 0;
    while (1) {
      k = c[e >> 2] | 0;
      k = wd[c[((c[k >> 2] | 0) + 20) >> 2] & 15](k, c[f >> 2] | 0, g, h, d) | 0;
      l = ((c[d >> 2] | 0) - j) | 0;
      if ((Ib(g | 0, 1, l | 0, c[a >> 2] | 0) | 0) != (l | 0)) {
        e = -1;
        d = 5;
        break;
      }
      if ((k | 0) == 2) {
        e = -1;
        d = 5;
        break;
      } else if ((k | 0) != 1) {
        d = 4;
        break;
      }
    }
    if ((d | 0) == 4) {
      l = (((Ac(c[a >> 2] | 0) | 0) != 0) << 31) >> 31;
      i = b;
      return l | 0;
    } else if ((d | 0) == 5) {
      i = b;
      return e | 0;
    }
    return 0;
  }
  function ei(b, e, f) {
    b = b | 0;
    e = e | 0;
    f = f | 0;
    var g = 0,
      h = 0;
    g = i;
    if (a[(b + 44) >> 0] | 0) {
      h = Ib(e | 0, 1, f | 0, c[(b + 32) >> 2] | 0) | 0;
      i = g;
      return h | 0;
    }
    if ((f | 0) > 0) h = 0;
    else {
      h = 0;
      i = g;
      return h | 0;
    }
    while (1) {
      if ((vd[c[((c[b >> 2] | 0) + 52) >> 2] & 63](b, d[e >> 0] | 0) | 0) == -1) {
        f = 6;
        break;
      }
      h = (h + 1) | 0;
      if ((h | 0) < (f | 0)) e = (e + 1) | 0;
      else {
        f = 6;
        break;
      }
    }
    if ((f | 0) == 6) {
      i = g;
      return h | 0;
    }
    return 0;
  }
  function fi(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0;
    e = i;
    i = (i + 32) | 0;
    k = (e + 16) | 0;
    p = (e + 8) | 0;
    j = (e + 4) | 0;
    h = e;
    f = (d | 0) == -1;
    a: do
      if (!f) {
        a[p >> 0] = d;
        if (a[(b + 44) >> 0] | 0) {
          if ((Ib(p | 0, 1, 1, c[(b + 32) >> 2] | 0) | 0) == 1) break;
          else d = -1;
          i = e;
          return d | 0;
        }
        c[j >> 2] = k;
        l = (p + 1) | 0;
        n = (b + 36) | 0;
        o = (b + 40) | 0;
        g = (k + 8) | 0;
        m = k;
        b = (b + 32) | 0;
        while (1) {
          q = c[n >> 2] | 0;
          q = rd[c[((c[q >> 2] | 0) + 12) >> 2] & 15](q, c[o >> 2] | 0, p, l, h, k, g, j) | 0;
          if ((c[h >> 2] | 0) == (p | 0)) {
            d = -1;
            g = 12;
            break;
          }
          if ((q | 0) == 3) {
            g = 7;
            break;
          }
          r = (q | 0) == 1;
          if (q >>> 0 >= 2) {
            d = -1;
            g = 12;
            break;
          }
          q = ((c[j >> 2] | 0) - m) | 0;
          if ((Ib(k | 0, 1, q | 0, c[b >> 2] | 0) | 0) != (q | 0)) {
            d = -1;
            g = 12;
            break;
          }
          if (r) p = r ? c[h >> 2] | 0 : p;
          else break a;
        }
        if ((g | 0) == 7) {
          if ((Ib(p | 0, 1, 1, c[b >> 2] | 0) | 0) == 1) break;
          else d = -1;
          i = e;
          return d | 0;
        } else if ((g | 0) == 12) {
          i = e;
          return d | 0;
        }
      }
    while (0);
    r = f ? 0 : d;
    i = e;
    return r | 0;
  }
  function gi(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0;
    b = i;
    c[a >> 2] = 16248;
    a = c[(a + 4) >> 2] | 0;
    e = (a + 4) | 0;
    d = c[e >> 2] | 0;
    c[e >> 2] = d + -1;
    if (d) {
      i = b;
      return;
    }
    jd[c[((c[a >> 2] | 0) + 8) >> 2] & 255](a);
    i = b;
    return;
  }
  function hi(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0,
      f = 0;
    b = i;
    c[a >> 2] = 16248;
    d = c[(a + 4) >> 2] | 0;
    f = (d + 4) | 0;
    e = c[f >> 2] | 0;
    c[f >> 2] = e + -1;
    if (e) {
      Uq(a);
      i = b;
      return;
    }
    jd[c[((c[d >> 2] | 0) + 8) >> 2] & 255](d);
    Uq(a);
    i = b;
    return;
  }
  function ii(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0;
    e = i;
    g = Sn(c[d >> 2] | 0, 19136) | 0;
    f = (b + 36) | 0;
    c[f >> 2] = g;
    d = (b + 44) | 0;
    c[d >> 2] = md[c[((c[g >> 2] | 0) + 24) >> 2] & 127](g) | 0;
    f = c[f >> 2] | 0;
    a[(b + 53) >> 0] = (md[c[((c[f >> 2] | 0) + 28) >> 2] & 127](f) | 0) & 1;
    if ((c[d >> 2] | 0) > 8) dn(15216);
    else {
      i = e;
      return;
    }
  }
  function ji(a) {
    a = a | 0;
    var b = 0;
    b = i;
    a = mi(a, 0) | 0;
    i = b;
    return a | 0;
  }
  function ki(a) {
    a = a | 0;
    var b = 0;
    b = i;
    a = mi(a, 1) | 0;
    i = b;
    return a | 0;
  }
  function li(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0;
    e = i;
    i = (i + 32) | 0;
    j = (e + 16) | 0;
    f = (e + 4) | 0;
    l = (e + 8) | 0;
    k = e;
    g = (b + 52) | 0;
    m = (a[g >> 0] | 0) != 0;
    if ((d | 0) == -1) {
      if (m) {
        m = -1;
        i = e;
        return m | 0;
      }
      m = c[(b + 48) >> 2] | 0;
      a[g >> 0] = ((m | 0) != -1) & 1;
      i = e;
      return m | 0;
    }
    h = (b + 48) | 0;
    a: do
      if (m) {
        a[l >> 0] = c[h >> 2];
        m = c[(b + 36) >> 2] | 0;
        k =
          rd[c[((c[m >> 2] | 0) + 12) >> 2] & 15](
            m,
            c[(b + 40) >> 2] | 0,
            l,
            (l + 1) | 0,
            k,
            j,
            (j + 8) | 0,
            f
          ) | 0;
        if (((k | 0) == 1) | ((k | 0) == 2)) {
          m = -1;
          i = e;
          return m | 0;
        } else if ((k | 0) == 3) {
          a[j >> 0] = c[h >> 2];
          c[f >> 2] = j + 1;
        }
        b = (b + 32) | 0;
        while (1) {
          k = c[f >> 2] | 0;
          if (k >>> 0 <= j >>> 0) break a;
          m = (k + -1) | 0;
          c[f >> 2] = m;
          if ((xc(a[m >> 0] | 0, c[b >> 2] | 0) | 0) == -1) {
            f = -1;
            break;
          }
        }
        i = e;
        return f | 0;
      }
    while (0);
    c[h >> 2] = d;
    a[g >> 0] = 1;
    m = d;
    i = e;
    return m | 0;
  }
  function mi(b, e) {
    b = b | 0;
    e = e | 0;
    var f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0;
    f = i;
    i = (i + 32) | 0;
    h = (f + 16) | 0;
    j = (f + 8) | 0;
    n = (f + 4) | 0;
    m = f;
    o = (b + 52) | 0;
    if (a[o >> 0] | 0) {
      g = (b + 48) | 0;
      h = c[g >> 2] | 0;
      if (!e) {
        w = h;
        i = f;
        return w | 0;
      }
      c[g >> 2] = -1;
      a[o >> 0] = 0;
      w = h;
      i = f;
      return w | 0;
    }
    p = c[(b + 44) >> 2] | 0;
    p = (p | 0) > 1 ? p : 1;
    a: do
      if ((p | 0) > 0) {
        r = (b + 32) | 0;
        o = 0;
        while (1) {
          q = Sc(c[r >> 2] | 0) | 0;
          if ((q | 0) == -1) {
            k = -1;
            break;
          }
          a[(h + o) >> 0] = q;
          o = (o + 1) | 0;
          if ((o | 0) >= (p | 0)) break a;
        }
        i = f;
        return k | 0;
      }
    while (0);
    b: do
      if (!(a[(b + 53) >> 0] | 0)) {
        r = (b + 40) | 0;
        s = (b + 36) | 0;
        o = (j + 1) | 0;
        q = (b + 32) | 0;
        while (1) {
          w = c[r >> 2] | 0;
          v = w;
          u = c[v >> 2] | 0;
          v = c[(v + 4) >> 2] | 0;
          x = c[s >> 2] | 0;
          t = (h + p) | 0;
          w = rd[c[((c[x >> 2] | 0) + 16) >> 2] & 15](x, w, h, t, n, j, o, m) | 0;
          if ((w | 0) == 2) {
            k = -1;
            m = 23;
            break;
          } else if ((w | 0) == 3) {
            m = 14;
            break;
          } else if ((w | 0) != 1) {
            l = p;
            break b;
          }
          x = c[r >> 2] | 0;
          c[x >> 2] = u;
          c[(x + 4) >> 2] = v;
          if ((p | 0) == 8) {
            k = -1;
            m = 23;
            break;
          }
          u = Sc(c[q >> 2] | 0) | 0;
          if ((u | 0) == -1) {
            k = -1;
            m = 23;
            break;
          }
          a[t >> 0] = u;
          p = (p + 1) | 0;
        }
        if ((m | 0) == 14) {
          a[j >> 0] = a[h >> 0] | 0;
          l = p;
          break;
        } else if ((m | 0) == 23) {
          i = f;
          return k | 0;
        }
      } else {
        a[j >> 0] = a[h >> 0] | 0;
        l = p;
      }
    while (0);
    do
      if (!e) {
        e = (b + 32) | 0;
        while (1) {
          if ((l | 0) <= 0) {
            m = 21;
            break;
          }
          l = (l + -1) | 0;
          if ((xc(d[(h + l) >> 0] | 0, c[e >> 2] | 0) | 0) == -1) {
            k = -1;
            m = 23;
            break;
          }
        }
        if ((m | 0) == 21) {
          g = a[j >> 0] | 0;
          break;
        } else if ((m | 0) == 23) {
          i = f;
          return k | 0;
        }
      } else {
        g = a[j >> 0] | 0;
        c[(b + 48) >> 2] = g & 255;
      }
    while (0);
    x = g & 255;
    i = f;
    return x | 0;
  }
  function ni() {
    var b = 0,
      d = 0,
      e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0;
    d = i;
    e = c[q >> 2] | 0;
    c[3662] = 16248;
    Qn(14652 | 0);
    c[3664] = 0;
    c[3665] = 0;
    c[3666] = 0;
    c[3667] = 0;
    c[3668] = 0;
    c[3669] = 0;
    c[3662] = 15376;
    c[3670] = e;
    c[3672] = 14704;
    c[3674] = -1;
    a[14700] = 0;
    j = c[3663] | 0;
    k = (j + 4) | 0;
    c[k >> 2] = (c[k >> 2] | 0) + 1;
    f = Rn(19136) | 0;
    g = c[(j + 8) >> 2] | 0;
    if (
      (((c[(j + 12) >> 2] | 0) - g) >> 2) >>> 0 > f >>> 0
        ? ((h = c[(g + (f << 2)) >> 2] | 0), (h | 0) != 0)
        : 0
    ) {
      c[3671] = h;
      c[3673] = md[c[((c[h >> 2] | 0) + 24) >> 2] & 127](h) | 0;
      h = c[3671] | 0;
      a[14701] = (md[c[((c[h >> 2] | 0) + 28) >> 2] & 127](h) | 0) & 1;
      if ((c[3673] | 0) > 8) dn(15216);
      h = c[k >> 2] | 0;
      c[k >> 2] = h + -1;
      if (!h) jd[c[((c[j >> 2] | 0) + 8) >> 2] & 255](j);
      c[3484] = 16380;
      c[3486] = 16400;
      c[3485] = 0;
      c[3492] = 14648;
      c[3490] = 0;
      c[3491] = 0;
      c[3487] = 4098;
      c[3489] = 0;
      c[3488] = 6;
      h = 13976 | 0;
      j = (h + 40) | 0;
      do {
        c[h >> 2] = 0;
        h = (h + 4) | 0;
      } while ((h | 0) < (j | 0));
      Qn(13972 | 0);
      c[3504] = 0;
      c[3505] = -1;
      f = c[r >> 2] | 0;
      $h(14752, f, 14712 | 0);
      c[3506] = 16460;
      c[3507] = 16480;
      c[3513] = 14752;
      c[3511] = 0;
      c[3512] = 0;
      c[3508] = 4098;
      c[3510] = 0;
      c[3509] = 6;
      h = 14060 | 0;
      j = (h + 40) | 0;
      do {
        c[h >> 2] = 0;
        h = (h + 4) | 0;
      } while ((h | 0) < (j | 0));
      Qn(14056 | 0);
      c[3525] = 0;
      c[3526] = -1;
      g = c[p >> 2] | 0;
      $h(14800, g, 14720 | 0);
      c[3528] = 16460;
      c[3529] = 16480;
      c[3535] = 14800;
      c[3533] = 0;
      c[3534] = 0;
      c[3530] = 4098;
      c[3532] = 0;
      c[3531] = 6;
      h = 14148 | 0;
      j = (h + 40) | 0;
      do {
        c[h >> 2] = 0;
        h = (h + 4) | 0;
      } while ((h | 0) < (j | 0));
      Qn(14144 | 0);
      c[3547] = 0;
      c[3548] = -1;
      h = c[((c[((c[3528] | 0) + -12) >> 2] | 0) + 14136) >> 2] | 0;
      c[3550] = 16460;
      c[3551] = 16480;
      c[3557] = h;
      c[3555] = ((h | 0) == 0) & 1;
      c[3556] = 0;
      c[3552] = 4098;
      c[3554] = 0;
      c[3553] = 6;
      h = 14236 | 0;
      j = (h + 40) | 0;
      do {
        c[h >> 2] = 0;
        h = (h + 4) | 0;
      } while ((h | 0) < (j | 0));
      Qn(14232 | 0);
      c[3569] = 0;
      c[3570] = -1;
      c[((c[((c[3484] | 0) + -12) >> 2] | 0) + 14008) >> 2] = 14024;
      j = ((c[((c[3528] | 0) + -12) >> 2] | 0) + 14116) | 0;
      c[j >> 2] = c[j >> 2] | 8192;
      c[((c[((c[3528] | 0) + -12) >> 2] | 0) + 14184) >> 2] = 14024;
      c[3712] = 16312;
      Qn(14852 | 0);
      c[3714] = 0;
      c[3715] = 0;
      c[3716] = 0;
      c[3717] = 0;
      c[3718] = 0;
      c[3719] = 0;
      c[3712] = 15120;
      c[3720] = e;
      c[3722] = 14728;
      c[3724] = -1;
      a[14900] = 0;
      j = c[3713] | 0;
      k = (j + 4) | 0;
      c[k >> 2] = (c[k >> 2] | 0) + 1;
      h = Rn(19144) | 0;
      e = c[(j + 8) >> 2] | 0;
      if (
        (((c[(j + 12) >> 2] | 0) - e) >> 2) >>> 0 > h >>> 0
          ? ((b = c[(e + (h << 2)) >> 2] | 0), (b | 0) != 0)
          : 0
      ) {
        c[3721] = b;
        c[3723] = md[c[((c[b >> 2] | 0) + 24) >> 2] & 127](b) | 0;
        h = c[3721] | 0;
        a[14901] = (md[c[((c[h >> 2] | 0) + 28) >> 2] & 127](h) | 0) & 1;
        if ((c[3723] | 0) > 8) dn(15216);
        h = c[k >> 2] | 0;
        c[k >> 2] = h + -1;
        if (!h) jd[c[((c[j >> 2] | 0) + 8) >> 2] & 255](j);
        c[3572] = 16420;
        c[3574] = 16440;
        c[3573] = 0;
        c[3580] = 14848;
        c[3578] = 0;
        c[3579] = 0;
        c[3575] = 4098;
        c[3577] = 0;
        c[3576] = 6;
        h = 14328 | 0;
        j = (h + 40) | 0;
        do {
          c[h >> 2] = 0;
          h = (h + 4) | 0;
        } while ((h | 0) < (j | 0));
        Qn(14324 | 0);
        c[3592] = 0;
        c[3593] = -1;
        Nh(14904, f, 14736 | 0);
        c[3594] = 16500;
        c[3595] = 16520;
        c[3601] = 14904;
        c[3599] = 0;
        c[3600] = 0;
        c[3596] = 4098;
        c[3598] = 0;
        c[3597] = 6;
        h = 14412 | 0;
        j = (h + 40) | 0;
        do {
          c[h >> 2] = 0;
          h = (h + 4) | 0;
        } while ((h | 0) < (j | 0));
        Qn(14408 | 0);
        c[3613] = 0;
        c[3614] = -1;
        Nh(14952, g, 14744 | 0);
        c[3616] = 16500;
        c[3617] = 16520;
        c[3623] = 14952;
        c[3621] = 0;
        c[3622] = 0;
        c[3618] = 4098;
        c[3620] = 0;
        c[3619] = 6;
        h = 14500 | 0;
        j = (h + 40) | 0;
        do {
          c[h >> 2] = 0;
          h = (h + 4) | 0;
        } while ((h | 0) < (j | 0));
        Qn(14496 | 0);
        c[3635] = 0;
        c[3636] = -1;
        h = c[((c[((c[3616] | 0) + -12) >> 2] | 0) + 14488) >> 2] | 0;
        c[3638] = 16500;
        c[3639] = 16520;
        c[3645] = h;
        c[3643] = ((h | 0) == 0) & 1;
        c[3644] = 0;
        c[3640] = 4098;
        c[3642] = 0;
        c[3641] = 6;
        h = 14588 | 0;
        j = (h + 40) | 0;
        do {
          c[h >> 2] = 0;
          h = (h + 4) | 0;
        } while ((h | 0) < (j | 0));
        Qn(14584 | 0);
        c[3657] = 0;
        c[3658] = -1;
        c[((c[((c[3572] | 0) + -12) >> 2] | 0) + 14360) >> 2] = 14376;
        k = ((c[((c[3616] | 0) + -12) >> 2] | 0) + 14468) | 0;
        c[k >> 2] = c[k >> 2] | 8192;
        c[((c[((c[3616] | 0) + -12) >> 2] | 0) + 14536) >> 2] = 14376;
        eb(242, 14640, o | 0) | 0;
        i = d;
        return;
      }
      k = Wb(4) | 0;
      c[k >> 2] = 27744;
      Zc(k | 0, 27816, 228);
    }
    k = Wb(4) | 0;
    c[k >> 2] = 27744;
    Zc(k | 0, 27816, 228);
  }
  function oi(a, b, d) {
    a = a | 0;
    b = b | 0;
    d = d | 0;
    c[a >> 2] = d;
    c[(a + 4) >> 2] = b;
    return;
  }
  function pi(a, b, d) {
    a = a | 0;
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0;
    e = i;
    i = (i + 16) | 0;
    f = e;
    od[c[((c[a >> 2] | 0) + 12) >> 2] & 15](f, a, b);
    if ((c[(f + 4) >> 2] | 0) != (c[(d + 4) >> 2] | 0)) {
      a = 0;
      i = e;
      return a | 0;
    }
    a = (c[f >> 2] | 0) == (c[d >> 2] | 0);
    i = e;
    return a | 0;
  }
  function qi(a, b, d) {
    a = a | 0;
    b = b | 0;
    d = d | 0;
    var e = 0;
    e = i;
    if ((c[(b + 4) >> 2] | 0) != (a | 0)) {
      a = 0;
      i = e;
      return a | 0;
    }
    a = (c[b >> 2] | 0) == (d | 0);
    i = e;
    return a | 0;
  }
  function ri(a) {
    a = a | 0;
    return 15568;
  }
  function si(b, d, e) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    var f = 0,
      g = 0;
    d = i;
    if ((e | 0) > 256) {
      e = $p(48) | 0;
      c[(b + 8) >> 2] = e;
      c[b >> 2] = 49;
      c[(b + 4) >> 2] = 34;
      g = (e + 0) | 0;
      f = 15576 | 0;
      b = (g + 34) | 0;
      do {
        a[g >> 0] = a[f >> 0] | 0;
        g = (g + 1) | 0;
        f = (f + 1) | 0;
      } while ((g | 0) < (b | 0));
      a[(e + 34) >> 0] = 0;
      i = d;
      return;
    } else {
      g = bd(e | 0) | 0;
      Gi(b, g, mr(g | 0) | 0);
      i = d;
      return;
    }
  }
  function ti(a) {
    a = a | 0;
    return;
  }
  function ui(a) {
    a = a | 0;
    return 15632;
  }
  function vi(b, d, e) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    var f = 0,
      g = 0;
    d = i;
    if ((e | 0) > 256) {
      e = $p(48) | 0;
      c[(b + 8) >> 2] = e;
      c[b >> 2] = 49;
      c[(b + 4) >> 2] = 33;
      g = (e + 0) | 0;
      f = 15640 | 0;
      b = (g + 33) | 0;
      do {
        a[g >> 0] = a[f >> 0] | 0;
        g = (g + 1) | 0;
        f = (f + 1) | 0;
      } while ((g | 0) < (b | 0));
      a[(e + 33) >> 0] = 0;
      i = d;
      return;
    } else {
      g = bd(e | 0) | 0;
      Gi(b, g, mr(g | 0) | 0);
      i = d;
      return;
    }
  }
  function wi(b, d, e) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    d = i;
    if ((e | 0) > 256) {
      if ((a[15688] | 0) == 0 ? (Fa(15688) | 0) != 0 : 0) {
        c[3920] = 15952;
        Vc(15688);
      }
      c[b >> 2] = e;
      c[(b + 4) >> 2] = 15680;
      i = d;
      return;
    } else {
      if ((a[15624] | 0) == 0 ? (Fa(15624) | 0) != 0 : 0) {
        c[3904] = 15856;
        Vc(15624);
      }
      c[b >> 2] = e;
      c[(b + 4) >> 2] = 15616;
      i = d;
      return;
    }
  }
  function xi(a) {
    a = a | 0;
    return;
  }
  function yi(b, d, e, f) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    var g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0;
    j = i;
    i = (i + 48) | 0;
    k = (j + 24) | 0;
    h = (j + 12) | 0;
    g = j;
    Gi(g, f, mr(f | 0) | 0);
    if (d) {
      f = a[g >> 0] | 0;
      if (!(f & 1)) f = (f & 255) >>> 1;
      else f = c[(g + 4) >> 2] | 0;
      if (f) Ni(g, 15696, 2);
      od[c[((c[e >> 2] | 0) + 24) >> 2] & 15](k, e, d);
      l = a[k >> 0] | 0;
      if (!(l & 1)) {
        f = (k + 1) | 0;
        l = (l & 255) >>> 1;
      } else {
        f = c[(k + 8) >> 2] | 0;
        l = c[(k + 4) >> 2] | 0;
      }
      Ni(g, f, l);
      if (a[k >> 0] & 1) Uq(c[(k + 8) >> 2] | 0);
    }
    c[(h + 0) >> 2] = c[(g + 0) >> 2];
    c[(h + 4) >> 2] = c[(g + 4) >> 2];
    c[(h + 8) >> 2] = c[(g + 8) >> 2];
    c[(g + 0) >> 2] = 0;
    c[(g + 4) >> 2] = 0;
    c[(g + 8) >> 2] = 0;
    c[b >> 2] = 27520;
    f = (a[h >> 0] & 1) == 0;
    if (f) k = (h + 1) | 0;
    else k = c[(h + 8) >> 2] | 0;
    m = mr(k | 0) | 0;
    l = $p((m + 13) | 0) | 0;
    c[l >> 2] = m;
    c[(l + 4) >> 2] = m;
    c[(l + 8) >> 2] = 0;
    l = (l + 12) | 0;
    nr(l | 0, k | 0, (m + 1) | 0) | 0;
    c[(b + 4) >> 2] = l;
    if (!f) Uq(c[(h + 8) >> 2] | 0);
    if (!(a[g >> 0] & 1)) {
      c[b >> 2] = 15712;
      m = (b + 8) | 0;
      l = e;
      f = m;
      c[f >> 2] = d;
      m = (m + 4) | 0;
      c[m >> 2] = l;
      i = j;
      return;
    }
    Uq(c[(g + 8) >> 2] | 0);
    c[b >> 2] = 15712;
    m = (b + 8) | 0;
    l = e;
    f = m;
    c[f >> 2] = d;
    m = (m + 4) | 0;
    c[m >> 2] = l;
    i = j;
    return;
  }
  function zi(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0,
      f = 0;
    b = i;
    c[a >> 2] = 27520;
    d = (a + 4) | 0;
    f = ((c[d >> 2] | 0) + -4) | 0;
    e = c[f >> 2] | 0;
    c[f >> 2] = e + -1;
    if (((e + -1) | 0) >= 0) {
      Uq(a);
      i = b;
      return;
    }
    Uq(((c[d >> 2] | 0) + -12) | 0);
    Uq(a);
    i = b;
    return;
  }
  function Ai(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0;
    b = i;
    c[a >> 2] = 27520;
    a = (a + 4) | 0;
    e = ((c[a >> 2] | 0) + -4) | 0;
    d = c[e >> 2] | 0;
    c[e >> 2] = d + -1;
    if (((d + -1) | 0) >= 0) {
      i = b;
      return;
    }
    Uq(((c[a >> 2] | 0) + -12) | 0);
    i = b;
    return;
  }
  function Bi(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function Ci(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function Di(a) {
    a = a | 0;
    var b = 0;
    b = i;
    ac(a | 0) | 0;
    i = b;
    return;
  }
  function Ei() {
    var b = 0,
      d = 0,
      e = 0,
      f = 0,
      g = 0,
      h = 0;
    f = Wb(8) | 0;
    c[f >> 2] = 27496;
    d = $p(25) | 0;
    e = (f + 4) | 0;
    c[d >> 2] = 12;
    c[(d + 4) >> 2] = 12;
    c[(d + 8) >> 2] = 0;
    d = (d + 12) | 0;
    h = (d + 0) | 0;
    g = 16224 | 0;
    b = (h + 13) | 0;
    do {
      a[h >> 0] = a[g >> 0] | 0;
      h = (h + 1) | 0;
      g = (g + 1) | 0;
    } while ((h | 0) < (b | 0));
    c[e >> 2] = d;
    c[f >> 2] = 27576;
    Zc(f | 0, 27616, 222);
  }
  function Fi(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0;
    e = i;
    if (!(a[d >> 0] & 1)) {
      c[(b + 0) >> 2] = c[(d + 0) >> 2];
      c[(b + 4) >> 2] = c[(d + 4) >> 2];
      c[(b + 8) >> 2] = c[(d + 8) >> 2];
      i = e;
      return;
    } else {
      Gi(b, c[(d + 8) >> 2] | 0, c[(d + 4) >> 2] | 0);
      i = e;
      return;
    }
  }
  function Gi(b, d, e) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    var f = 0,
      g = 0,
      h = 0;
    f = i;
    if (e >>> 0 > 4294967279) Ei();
    if (e >>> 0 < 11) {
      a[b >> 0] = e << 1;
      b = (b + 1) | 0;
    } else {
      h = (e + 16) & -16;
      g = $p(h) | 0;
      c[(b + 8) >> 2] = g;
      c[b >> 2] = h | 1;
      c[(b + 4) >> 2] = e;
      b = g;
    }
    nr(b | 0, d | 0, e | 0) | 0;
    a[(b + e) >> 0] = 0;
    i = f;
    return;
  }
  function Hi(b, d, e) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    var f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0;
    f = i;
    h = d;
    g = (e - h) | 0;
    if (g >>> 0 > 4294967279) Ei();
    if (g >>> 0 < 11) {
      a[b >> 0] = g << 1;
      g = (b + 1) | 0;
    } else {
      k = (g + 16) & -16;
      j = $p(k) | 0;
      c[(b + 8) >> 2] = j;
      c[b >> 2] = k | 1;
      c[(b + 4) >> 2] = g;
      g = j;
    }
    if ((d | 0) == (e | 0)) {
      k = g;
      a[k >> 0] = 0;
      i = f;
      return;
    }
    h = (e + (0 - h)) | 0;
    b = g;
    while (1) {
      a[b >> 0] = a[d >> 0] | 0;
      d = (d + 1) | 0;
      if ((d | 0) == (e | 0)) break;
      else b = (b + 1) | 0;
    }
    k = (g + h) | 0;
    a[k >> 0] = 0;
    i = f;
    return;
  }
  function Ii(b) {
    b = b | 0;
    var d = 0;
    d = i;
    if (!(a[b >> 0] & 1)) {
      i = d;
      return;
    }
    Uq(c[(b + 8) >> 2] | 0);
    i = d;
    return;
  }
  function Ji(b, d, e) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    var f = 0,
      g = 0,
      h = 0,
      j = 0;
    f = i;
    h = a[b >> 0] | 0;
    if (!(h & 1)) g = 10;
    else {
      h = c[b >> 2] | 0;
      g = ((h & -2) + -1) | 0;
      h = h & 255;
    }
    j = (h & 1) == 0;
    if (g >>> 0 < e >>> 0) {
      if (j) h = (h & 255) >>> 1;
      else h = c[(b + 4) >> 2] | 0;
      Oi(b, g, (e - g) | 0, h, 0, h, e, d);
      i = f;
      return;
    }
    if (j) g = (b + 1) | 0;
    else g = c[(b + 8) >> 2] | 0;
    pr(g | 0, d | 0, e | 0) | 0;
    a[(g + e) >> 0] = 0;
    if (!(a[b >> 0] & 1)) {
      a[b >> 0] = e << 1;
      i = f;
      return;
    } else {
      c[(b + 4) >> 2] = e;
      i = f;
      return;
    }
  }
  function Ki(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0;
    e = i;
    g = a[b >> 0] | 0;
    j = (g & 1) == 0;
    if (j) h = (g & 255) >>> 1;
    else h = c[(b + 4) >> 2] | 0;
    if (h >>> 0 >= d >>> 0)
      if (j) {
        a[(b + d + 1) >> 0] = 0;
        a[b >> 0] = d << 1;
        i = e;
        return;
      } else {
        a[((c[(b + 8) >> 2] | 0) + d) >> 0] = 0;
        c[(b + 4) >> 2] = d;
        i = e;
        return;
      }
    f = (d - h) | 0;
    if ((h | 0) == (d | 0)) {
      i = e;
      return;
    }
    if (j) {
      h = g;
      d = 10;
    } else {
      d = c[b >> 2] | 0;
      h = d & 255;
      d = ((d & -2) + -1) | 0;
    }
    if (!(h & 1)) g = (h & 255) >>> 1;
    else g = c[(b + 4) >> 2] | 0;
    if (((d - g) | 0) >>> 0 < f >>> 0) {
      Pi(b, d, (f - d + g) | 0, g, g, 0);
      h = a[b >> 0] | 0;
    }
    if (!(h & 1)) d = (b + 1) | 0;
    else d = c[(b + 8) >> 2] | 0;
    qr((d + g) | 0, 0, f | 0) | 0;
    f = (g + f) | 0;
    if (!(a[b >> 0] & 1)) a[b >> 0] = f << 1;
    else c[(b + 4) >> 2] = f;
    a[(d + f) >> 0] = 0;
    i = e;
    return;
  }
  function Li(b) {
    b = b | 0;
    var d = 0,
      e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0;
    d = i;
    g = a[b >> 0] | 0;
    if (!(g & 1)) j = 10;
    else {
      g = c[b >> 2] | 0;
      j = ((g & -2) + -1) | 0;
      g = g & 255;
    }
    h = (g & 1) == 0;
    if (h) e = (g & 255) >>> 1;
    else e = c[(b + 4) >> 2] | 0;
    if (e >>> 0 < 11) f = 10;
    else f = (((e + 16) & -16) + -1) | 0;
    if ((f | 0) == (j | 0)) {
      i = d;
      return;
    }
    do
      if ((f | 0) == 10) {
        k = (b + 1) | 0;
        j = c[(b + 8) >> 2] | 0;
        if (h) {
          nr(k | 0, j | 0, (((g & 255) >>> 1) + 1) | 0) | 0;
          Uq(j);
          h = 20;
        } else {
          g = 0;
          h = 18;
        }
      } else {
        k = (f + 1) | 0;
        if (f >>> 0 > j >>> 0) k = $p(k) | 0;
        else k = $p(k) | 0;
        if (h) {
          nr(k | 0, (b + 1) | 0, (((g & 255) >>> 1) + 1) | 0) | 0;
          h = 19;
          break;
        } else {
          g = 1;
          j = c[(b + 8) >> 2] | 0;
          h = 18;
          break;
        }
      }
    while (0);
    if ((h | 0) == 18) {
      nr(k | 0, j | 0, ((c[(b + 4) >> 2] | 0) + 1) | 0) | 0;
      Uq(j);
      if (g) h = 19;
      else h = 20;
    }
    if ((h | 0) == 19) {
      c[b >> 2] = (f + 1) | 1;
      c[(b + 4) >> 2] = e;
      c[(b + 8) >> 2] = k;
      i = d;
      return;
    } else if ((h | 0) == 20) {
      a[b >> 0] = e << 1;
      i = d;
      return;
    }
  }
  function Mi(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0;
    e = i;
    g = a[b >> 0] | 0;
    f = (g & 1) != 0;
    if (f) {
      h = ((c[b >> 2] & -2) + -1) | 0;
      g = c[(b + 4) >> 2] | 0;
    } else {
      h = 10;
      g = (g & 255) >>> 1;
    }
    if ((g | 0) == (h | 0)) {
      Pi(b, h, 1, h, h, 0);
      if (!(a[b >> 0] & 1)) f = 7;
      else f = 8;
    } else if (f) f = 8;
    else f = 7;
    if ((f | 0) == 7) {
      a[b >> 0] = (g << 1) + 2;
      f = (b + 1) | 0;
      h = (g + 1) | 0;
      g = (f + g) | 0;
      a[g >> 0] = d;
      h = (f + h) | 0;
      a[h >> 0] = 0;
      i = e;
      return;
    } else if ((f | 0) == 8) {
      f = c[(b + 8) >> 2] | 0;
      h = (g + 1) | 0;
      c[(b + 4) >> 2] = h;
      g = (f + g) | 0;
      a[g >> 0] = d;
      h = (f + h) | 0;
      a[h >> 0] = 0;
      i = e;
      return;
    }
  }
  function Ni(b, d, e) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    var f = 0,
      g = 0,
      h = 0,
      j = 0;
    f = i;
    j = a[b >> 0] | 0;
    if (!(j & 1)) g = 10;
    else {
      j = c[b >> 2] | 0;
      g = ((j & -2) + -1) | 0;
      j = j & 255;
    }
    h = (j & 1) == 0;
    if (h) j = (j & 255) >>> 1;
    else j = c[(b + 4) >> 2] | 0;
    if (((g - j) | 0) >>> 0 < e >>> 0) {
      Oi(b, g, (e - g + j) | 0, j, j, 0, e, d);
      i = f;
      return;
    }
    if (!e) {
      i = f;
      return;
    }
    if (h) g = (b + 1) | 0;
    else g = c[(b + 8) >> 2] | 0;
    nr((g + j) | 0, d | 0, e | 0) | 0;
    e = (j + e) | 0;
    if (!(a[b >> 0] & 1)) a[b >> 0] = e << 1;
    else c[(b + 4) >> 2] = e;
    a[(g + e) >> 0] = 0;
    i = f;
    return;
  }
  function Oi(b, d, e, f, g, h, j, k) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    k = k | 0;
    var l = 0,
      m = 0,
      n = 0;
    l = i;
    if (((-18 - d) | 0) >>> 0 < e >>> 0) Ei();
    if (!(a[b >> 0] & 1)) m = (b + 1) | 0;
    else m = c[(b + 8) >> 2] | 0;
    if (d >>> 0 < 2147483623) {
      e = (e + d) | 0;
      n = d << 1;
      e = e >>> 0 < n >>> 0 ? n : e;
      if (e >>> 0 < 11) e = 11;
      else e = (e + 16) & -16;
    } else e = -17;
    n = $p(e) | 0;
    if (g) nr(n | 0, m | 0, g | 0) | 0;
    if (j) nr((n + g) | 0, k | 0, j | 0) | 0;
    k = (f - h) | 0;
    if ((k | 0) != (g | 0)) nr((n + (j + g)) | 0, (m + (h + g)) | 0, (k - g) | 0) | 0;
    if ((d | 0) == 10) {
      f = (b + 8) | 0;
      c[f >> 2] = n;
      e = e | 1;
      c[b >> 2] = e;
      e = (k + j) | 0;
      f = (b + 4) | 0;
      c[f >> 2] = e;
      n = (n + e) | 0;
      a[n >> 0] = 0;
      i = l;
      return;
    }
    Uq(m);
    f = (b + 8) | 0;
    c[f >> 2] = n;
    e = e | 1;
    c[b >> 2] = e;
    e = (k + j) | 0;
    f = (b + 4) | 0;
    c[f >> 2] = e;
    n = (n + e) | 0;
    a[n >> 0] = 0;
    i = l;
    return;
  }
  function Pi(b, d, e, f, g, h) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    var j = 0,
      k = 0,
      l = 0;
    j = i;
    if (((-17 - d) | 0) >>> 0 < e >>> 0) Ei();
    if (!(a[b >> 0] & 1)) k = (b + 1) | 0;
    else k = c[(b + 8) >> 2] | 0;
    if (d >>> 0 < 2147483623) {
      e = (e + d) | 0;
      l = d << 1;
      e = e >>> 0 < l >>> 0 ? l : e;
      if (e >>> 0 < 11) l = 11;
      else l = (e + 16) & -16;
    } else l = -17;
    e = $p(l) | 0;
    if (g) nr(e | 0, k | 0, g | 0) | 0;
    if ((f | 0) != (g | 0)) nr((e + (h + g)) | 0, (k + g) | 0, (f - g) | 0) | 0;
    if ((d | 0) == 10) {
      k = (b + 8) | 0;
      c[k >> 2] = e;
      l = l | 1;
      c[b >> 2] = l;
      i = j;
      return;
    }
    Uq(k);
    k = (b + 8) | 0;
    c[k >> 2] = e;
    l = l | 1;
    c[b >> 2] = l;
    i = j;
    return;
  }
  function Qi(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0;
    f = i;
    g = mr(d | 0) | 0;
    h = a[b >> 0] | 0;
    j = (h & 1) == 0;
    if (j) h = (h & 255) >>> 1;
    else h = c[(b + 4) >> 2] | 0;
    if ((g | 0) == -1) {
      b = Wb(8) | 0;
      c[b >> 2] = 27496;
      d = $p(25) | 0;
      h = (b + 4) | 0;
      c[d >> 2] = 12;
      c[(d + 4) >> 2] = 12;
      c[(d + 8) >> 2] = 0;
      d = (d + 12) | 0;
      g = (d + 0) | 0;
      e = 16224 | 0;
      f = (g + 13) | 0;
      do {
        a[g >> 0] = a[e >> 0] | 0;
        g = (g + 1) | 0;
        e = (e + 1) | 0;
      } while ((g | 0) < (f | 0));
      c[h >> 2] = d;
      c[b >> 2] = 27640;
      Zc(b | 0, 27680, 222);
    }
    if (j) k = (b + 1) | 0;
    else k = c[(b + 8) >> 2] | 0;
    b = h >>> 0 > g >>> 0;
    j = b ? g : h;
    if (!j) {
      l = h >>> 0 < g >>> 0;
      m = b & 1;
      m = l ? -1 : m;
      i = f;
      return m | 0;
    }
    while (1) {
      l = a[k >> 0] | 0;
      m = a[d >> 0] | 0;
      if ((l << 24) >> 24 != (m << 24) >> 24) break;
      j = (j + -1) | 0;
      if (!j) {
        e = 15;
        break;
      } else {
        k = (k + 1) | 0;
        d = (d + 1) | 0;
      }
    }
    if ((e | 0) == 15) {
      l = h >>> 0 < g >>> 0;
      m = b & 1;
      m = l ? -1 : m;
      i = f;
      return m | 0;
    }
    if ((l << 24) >> 24 == (m << 24) >> 24) {
      l = h >>> 0 < g >>> 0;
      m = b & 1;
      m = l ? -1 : m;
      i = f;
      return m | 0;
    } else {
      i = f;
      return ((l & 255) - (m & 255)) | 0;
    }
    return 0;
  }
  function Ri(b, d, e) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    var f = 0,
      g = 0,
      h = 0;
    f = i;
    if (e >>> 0 > 1073741807) Ei();
    if (e >>> 0 < 2) {
      a[b >> 0] = e << 1;
      b = (b + 4) | 0;
    } else {
      g = (e + 4) & -4;
      h = $p(g << 2) | 0;
      c[(b + 8) >> 2] = h;
      c[b >> 2] = g | 1;
      c[(b + 4) >> 2] = e;
      b = h;
    }
    if (!e) {
      h = (b + (e << 2)) | 0;
      c[h >> 2] = 0;
      i = f;
      return;
    } else {
      g = e;
      h = b;
    }
    while (1) {
      g = (g + -1) | 0;
      c[h >> 2] = c[d >> 2];
      if (!g) break;
      else {
        d = (d + 4) | 0;
        h = (h + 4) | 0;
      }
    }
    h = (b + (e << 2)) | 0;
    c[h >> 2] = 0;
    i = f;
    return;
  }
  function Si(b, d, e) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    var f = 0,
      g = 0,
      h = 0;
    f = i;
    if (d >>> 0 > 1073741807) Ei();
    if (d >>> 0 < 2) {
      a[b >> 0] = d << 1;
      b = (b + 4) | 0;
    } else {
      g = (d + 4) & -4;
      h = $p(g << 2) | 0;
      c[(b + 8) >> 2] = h;
      c[b >> 2] = g | 1;
      c[(b + 4) >> 2] = d;
      b = h;
    }
    if (!d) {
      h = (b + (d << 2)) | 0;
      c[h >> 2] = 0;
      i = f;
      return;
    } else {
      h = d;
      g = b;
    }
    while (1) {
      h = (h + -1) | 0;
      c[g >> 2] = e;
      if (!h) break;
      else g = (g + 4) | 0;
    }
    h = (b + (d << 2)) | 0;
    c[h >> 2] = 0;
    i = f;
    return;
  }
  function Ti(b, d, e) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    var f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0;
    f = i;
    g = d;
    h = (e - g) | 0;
    j = h >> 2;
    if (j >>> 0 > 1073741807) Ei();
    if (j >>> 0 < 2) {
      a[b >> 0] = h >>> 1;
      h = (b + 4) | 0;
    } else {
      k = (j + 4) & -4;
      h = $p(k << 2) | 0;
      c[(b + 8) >> 2] = h;
      c[b >> 2] = k | 1;
      c[(b + 4) >> 2] = j;
    }
    if ((d | 0) == (e | 0)) {
      k = h;
      c[k >> 2] = 0;
      i = f;
      return;
    }
    g = ((((e + -4 + (0 - g)) | 0) >>> 2) + 1) | 0;
    j = h;
    while (1) {
      c[j >> 2] = c[d >> 2];
      d = (d + 4) | 0;
      if ((d | 0) == (e | 0)) break;
      else j = (j + 4) | 0;
    }
    k = (h + (g << 2)) | 0;
    c[k >> 2] = 0;
    i = f;
    return;
  }
  function Ui(b) {
    b = b | 0;
    var d = 0;
    d = i;
    if (!(a[b >> 0] & 1)) {
      i = d;
      return;
    }
    Uq(c[(b + 8) >> 2] | 0);
    i = d;
    return;
  }
  function Vi(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0;
    e = i;
    f = d;
    while (1)
      if (!(c[f >> 2] | 0)) break;
      else f = (f + 4) | 0;
    j = d;
    h = (f - j) | 0;
    f = h >> 2;
    k = a[b >> 0] | 0;
    if (!(k & 1)) g = 1;
    else {
      k = c[b >> 2] | 0;
      g = ((k & -2) + -1) | 0;
      k = k & 255;
    }
    if (g >>> 0 >= f >>> 0) {
      if (!(k & 1)) g = (b + 4) | 0;
      else g = c[(b + 8) >> 2] | 0;
      k = (f | 0) == 0;
      if (((g - j) >> 2) >>> 0 < f >>> 0) {
        if (!k) {
          j = f;
          do {
            j = (j + -1) | 0;
            c[(g + (j << 2)) >> 2] = c[(d + (j << 2)) >> 2];
          } while ((j | 0) != 0);
        }
      } else if (!k) {
        j = g;
        k = f;
        while (1) {
          k = (k + -1) | 0;
          c[j >> 2] = c[d >> 2];
          if (!k) break;
          else {
            d = (d + 4) | 0;
            j = (j + 4) | 0;
          }
        }
      }
      c[(g + (f << 2)) >> 2] = 0;
      if (!(a[b >> 0] & 1)) {
        a[b >> 0] = h >>> 1;
        i = e;
        return;
      } else {
        c[(b + 4) >> 2] = f;
        i = e;
        return;
      }
    }
    if (((1073741806 - g) | 0) >>> 0 < ((f - g) | 0) >>> 0) Ei();
    if (!(k & 1)) h = (b + 4) | 0;
    else h = c[(b + 8) >> 2] | 0;
    if (g >>> 0 < 536870887) {
      j = g << 1;
      j = f >>> 0 < j >>> 0 ? j : f;
      if (j >>> 0 < 2) k = 2;
      else k = (j + 4) & -4;
    } else k = 1073741807;
    j = $p(k << 2) | 0;
    if (f) {
      l = f;
      m = j;
      while (1) {
        l = (l + -1) | 0;
        c[m >> 2] = c[d >> 2];
        if (!l) break;
        else {
          d = (d + 4) | 0;
          m = (m + 4) | 0;
        }
      }
    }
    if ((g | 0) != 1) Uq(h);
    c[(b + 8) >> 2] = j;
    c[b >> 2] = k | 1;
    c[(b + 4) >> 2] = f;
    c[(j + (f << 2)) >> 2] = 0;
    i = e;
    return;
  }
  function Wi(b) {
    b = b | 0;
    var d = 0,
      e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0;
    d = i;
    j = a[b >> 0] | 0;
    if (!(j & 1)) g = 1;
    else {
      j = c[b >> 2] | 0;
      g = ((j & -2) + -1) | 0;
      j = j & 255;
    }
    h = (j & 1) == 0;
    if (h) e = (j & 255) >>> 1;
    else e = c[(b + 4) >> 2] | 0;
    if (e >>> 0 < 2) f = 1;
    else f = (((e + 4) & -4) + -1) | 0;
    if ((f | 0) == (g | 0)) {
      i = d;
      return;
    }
    do
      if ((f | 0) == 1) {
        g = (b + 4) | 0;
        l = c[(b + 8) >> 2] | 0;
        if (h) {
          k = 0;
          m = 1;
          h = 18;
        } else {
          k = 0;
          m = 1;
          h = 17;
        }
      } else {
        k = ((f << 2) + 4) | 0;
        if (f >>> 0 > g >>> 0) g = $p(k) | 0;
        else g = $p(k) | 0;
        if (h) {
          k = 1;
          l = (b + 4) | 0;
          m = 0;
          h = 18;
          break;
        } else {
          k = 1;
          l = c[(b + 8) >> 2] | 0;
          m = 1;
          h = 17;
          break;
        }
      }
    while (0);
    if ((h | 0) == 17) j = c[(b + 4) >> 2] | 0;
    else if ((h | 0) == 18) j = (j & 255) >>> 1;
    j = (j + 1) | 0;
    if (j) {
      n = l;
      h = g;
      while (1) {
        j = (j + -1) | 0;
        c[h >> 2] = c[n >> 2];
        if (!j) break;
        else {
          n = (n + 4) | 0;
          h = (h + 4) | 0;
        }
      }
    }
    if (m) Uq(l);
    if (k) {
      c[b >> 2] = (f + 1) | 1;
      c[(b + 4) >> 2] = e;
      c[(b + 8) >> 2] = g;
      i = d;
      return;
    } else {
      a[b >> 0] = e << 1;
      i = d;
      return;
    }
  }
  function Xi(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0;
    e = i;
    g = a[b >> 0] | 0;
    f = (g & 1) != 0;
    if (f) {
      h = ((c[b >> 2] & -2) + -1) | 0;
      g = c[(b + 4) >> 2] | 0;
    } else {
      h = 1;
      g = (g & 255) >>> 1;
    }
    if ((g | 0) == (h | 0)) {
      Yi(b, h, 1, h, h, 0, 0);
      if (!(a[b >> 0] & 1)) f = 7;
      else f = 8;
    } else if (f) f = 8;
    else f = 7;
    if ((f | 0) == 7) {
      a[b >> 0] = (g << 1) + 2;
      f = (b + 4) | 0;
      h = (g + 1) | 0;
      g = (f + (g << 2)) | 0;
      c[g >> 2] = d;
      h = (f + (h << 2)) | 0;
      c[h >> 2] = 0;
      i = e;
      return;
    } else if ((f | 0) == 8) {
      f = c[(b + 8) >> 2] | 0;
      h = (g + 1) | 0;
      c[(b + 4) >> 2] = h;
      g = (f + (g << 2)) | 0;
      c[g >> 2] = d;
      h = (f + (h << 2)) | 0;
      c[h >> 2] = 0;
      i = e;
      return;
    }
  }
  function Yi(b, d, e, f, g, h, j) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    var k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0;
    k = i;
    if (((1073741807 - d) | 0) >>> 0 < e >>> 0) Ei();
    if (!(a[b >> 0] & 1)) l = (b + 4) | 0;
    else l = c[(b + 8) >> 2] | 0;
    if (d >>> 0 < 536870887) {
      e = (e + d) | 0;
      p = d << 1;
      e = e >>> 0 < p >>> 0 ? p : e;
      if (e >>> 0 < 2) e = 2;
      else e = (e + 4) & -4;
    } else e = 1073741807;
    m = $p(e << 2) | 0;
    if (g) {
      n = g;
      o = l;
      p = m;
      while (1) {
        n = (n + -1) | 0;
        c[p >> 2] = c[o >> 2];
        if (!n) break;
        else {
          o = (o + 4) | 0;
          p = (p + 4) | 0;
        }
      }
    }
    f = (f - h) | 0;
    if ((f | 0) != (g | 0)) {
      f = (f - g) | 0;
      h = (l + ((h + g) << 2)) | 0;
      j = (m + ((j + g) << 2)) | 0;
      while (1) {
        f = (f + -1) | 0;
        c[j >> 2] = c[h >> 2];
        if (!f) break;
        else {
          h = (h + 4) | 0;
          j = (j + 4) | 0;
        }
      }
    }
    if ((d | 0) == 1) {
      p = (b + 8) | 0;
      c[p >> 2] = m;
      p = e | 1;
      c[b >> 2] = p;
      i = k;
      return;
    }
    Uq(l);
    p = (b + 8) | 0;
    c[p >> 2] = m;
    p = e | 1;
    c[b >> 2] = p;
    i = k;
    return;
  }
  function Zi(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0;
    e = (c[(b + 24) >> 2] | 0) == 0;
    if (e) c[(b + 16) >> 2] = d | 1;
    else c[(b + 16) >> 2] = d;
    if (!(((e & 1) | d) & c[(b + 20) >> 2])) return;
    d = Wb(16) | 0;
    if ((a[16592] | 0) == 0 ? (Fa(16592) | 0) != 0 : 0) {
      c[4146] = 17368;
      Vc(16592);
    }
    yi(d, 1, 16584, 16640);
    c[d >> 2] = 16608;
    Zc(d | 0, 16688, 155);
  }
  function _i(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0,
      f = 0;
    b = i;
    c[a >> 2] = 16632;
    f = c[(a + 40) >> 2] | 0;
    if (f) {
      d = (a + 32) | 0;
      e = (a + 36) | 0;
      do {
        f = (f + -1) | 0;
        od[c[((c[d >> 2] | 0) + (f << 2)) >> 2] & 15](
          0,
          a,
          c[((c[e >> 2] | 0) + (f << 2)) >> 2] | 0
        );
      } while ((f | 0) != 0);
    }
    d = c[(a + 28) >> 2] | 0;
    e = (d + 4) | 0;
    f = c[e >> 2] | 0;
    c[e >> 2] = f + -1;
    if (!f) jd[c[((c[d >> 2] | 0) + 8) >> 2] & 255](d);
    Uq(c[(a + 32) >> 2] | 0);
    Uq(c[(a + 36) >> 2] | 0);
    Uq(c[(a + 48) >> 2] | 0);
    Uq(c[(a + 60) >> 2] | 0);
    i = b;
    return;
  }
  function $i(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0,
      f = 0;
    b = i;
    c[a >> 2] = 16248;
    d = c[(a + 4) >> 2] | 0;
    f = (d + 4) | 0;
    e = c[f >> 2] | 0;
    c[f >> 2] = e + -1;
    if (e) {
      Uq(a);
      i = b;
      return;
    }
    jd[c[((c[d >> 2] | 0) + 8) >> 2] & 255](d);
    Uq(a);
    i = b;
    return;
  }
  function aj(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0;
    b = i;
    c[a >> 2] = 16248;
    a = c[(a + 4) >> 2] | 0;
    e = (a + 4) | 0;
    d = c[e >> 2] | 0;
    c[e >> 2] = d + -1;
    if (d) {
      i = b;
      return;
    }
    jd[c[((c[a >> 2] | 0) + 8) >> 2] & 255](a);
    i = b;
    return;
  }
  function bj(a, b) {
    a = a | 0;
    b = b | 0;
    return;
  }
  function cj(a, b, c) {
    a = a | 0;
    b = b | 0;
    c = c | 0;
    return a | 0;
  }
  function dj(a, b, d, e, f, g) {
    a = a | 0;
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    g = a;
    c[g >> 2] = 0;
    c[(g + 4) >> 2] = 0;
    g = (a + 8) | 0;
    c[g >> 2] = -1;
    c[(g + 4) >> 2] = -1;
    return;
  }
  function ej(a, b, d, e) {
    a = a | 0;
    b = b | 0;
    d = d | 0;
    e = e | 0;
    e = a;
    c[e >> 2] = 0;
    c[(e + 4) >> 2] = 0;
    e = (a + 8) | 0;
    c[e >> 2] = -1;
    c[(e + 4) >> 2] = -1;
    return;
  }
  function fj(a) {
    a = a | 0;
    return 0;
  }
  function gj(a) {
    a = a | 0;
    return 0;
  }
  function hj(b, d, e) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    var f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0;
    f = i;
    if ((e | 0) <= 0) {
      k = 0;
      i = f;
      return k | 0;
    }
    g = (b + 12) | 0;
    h = (b + 16) | 0;
    j = 0;
    while (1) {
      k = c[g >> 2] | 0;
      if (k >>> 0 < (c[h >> 2] | 0) >>> 0) {
        c[g >> 2] = k + 1;
        k = a[k >> 0] | 0;
      } else {
        k = md[c[((c[b >> 2] | 0) + 40) >> 2] & 127](b) | 0;
        if ((k | 0) == -1) {
          e = 8;
          break;
        }
        k = k & 255;
      }
      a[d >> 0] = k;
      j = (j + 1) | 0;
      if ((j | 0) < (e | 0)) d = (d + 1) | 0;
      else {
        e = 8;
        break;
      }
    }
    if ((e | 0) == 8) {
      i = f;
      return j | 0;
    }
    return 0;
  }
  function ij(a) {
    a = a | 0;
    return -1;
  }
  function jj(a) {
    a = a | 0;
    var b = 0,
      e = 0;
    b = i;
    if ((md[c[((c[a >> 2] | 0) + 36) >> 2] & 127](a) | 0) == -1) {
      a = -1;
      i = b;
      return a | 0;
    }
    e = (a + 12) | 0;
    a = c[e >> 2] | 0;
    c[e >> 2] = a + 1;
    a = d[a >> 0] | 0;
    i = b;
    return a | 0;
  }
  function kj(a, b) {
    a = a | 0;
    b = b | 0;
    return -1;
  }
  function lj(b, e, f) {
    b = b | 0;
    e = e | 0;
    f = f | 0;
    var g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0;
    g = i;
    if ((f | 0) <= 0) {
      l = 0;
      i = g;
      return l | 0;
    }
    j = (b + 24) | 0;
    h = (b + 28) | 0;
    k = 0;
    while (1) {
      l = c[j >> 2] | 0;
      if (l >>> 0 >= (c[h >> 2] | 0) >>> 0) {
        if ((vd[c[((c[b >> 2] | 0) + 52) >> 2] & 63](b, d[e >> 0] | 0) | 0) == -1) {
          h = 7;
          break;
        }
      } else {
        m = a[e >> 0] | 0;
        c[j >> 2] = l + 1;
        a[l >> 0] = m;
      }
      k = (k + 1) | 0;
      if ((k | 0) < (f | 0)) e = (e + 1) | 0;
      else {
        h = 7;
        break;
      }
    }
    if ((h | 0) == 7) {
      i = g;
      return k | 0;
    }
    return 0;
  }
  function mj(a, b) {
    a = a | 0;
    b = b | 0;
    return -1;
  }
  function nj(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0,
      f = 0;
    b = i;
    c[a >> 2] = 16312;
    d = c[(a + 4) >> 2] | 0;
    f = (d + 4) | 0;
    e = c[f >> 2] | 0;
    c[f >> 2] = e + -1;
    if (e) {
      Uq(a);
      i = b;
      return;
    }
    jd[c[((c[d >> 2] | 0) + 8) >> 2] & 255](d);
    Uq(a);
    i = b;
    return;
  }
  function oj(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0;
    b = i;
    c[a >> 2] = 16312;
    a = c[(a + 4) >> 2] | 0;
    e = (a + 4) | 0;
    d = c[e >> 2] | 0;
    c[e >> 2] = d + -1;
    if (d) {
      i = b;
      return;
    }
    jd[c[((c[a >> 2] | 0) + 8) >> 2] & 255](a);
    i = b;
    return;
  }
  function pj(a, b) {
    a = a | 0;
    b = b | 0;
    return;
  }
  function qj(a, b, c) {
    a = a | 0;
    b = b | 0;
    c = c | 0;
    return a | 0;
  }
  function rj(a, b, d, e, f, g) {
    a = a | 0;
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    g = a;
    c[g >> 2] = 0;
    c[(g + 4) >> 2] = 0;
    g = (a + 8) | 0;
    c[g >> 2] = -1;
    c[(g + 4) >> 2] = -1;
    return;
  }
  function sj(a, b, d, e) {
    a = a | 0;
    b = b | 0;
    d = d | 0;
    e = e | 0;
    e = a;
    c[e >> 2] = 0;
    c[(e + 4) >> 2] = 0;
    e = (a + 8) | 0;
    c[e >> 2] = -1;
    c[(e + 4) >> 2] = -1;
    return;
  }
  function tj(a) {
    a = a | 0;
    return 0;
  }
  function uj(a) {
    a = a | 0;
    return 0;
  }
  function vj(a, b, d) {
    a = a | 0;
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0;
    e = i;
    if ((d | 0) <= 0) {
      j = 0;
      i = e;
      return j | 0;
    }
    g = (a + 12) | 0;
    f = (a + 16) | 0;
    h = 0;
    while (1) {
      j = c[g >> 2] | 0;
      if (j >>> 0 >= (c[f >> 2] | 0) >>> 0) {
        j = md[c[((c[a >> 2] | 0) + 40) >> 2] & 127](a) | 0;
        if ((j | 0) == -1) {
          a = 8;
          break;
        }
      } else {
        c[g >> 2] = j + 4;
        j = c[j >> 2] | 0;
      }
      c[b >> 2] = j;
      h = (h + 1) | 0;
      if ((h | 0) >= (d | 0)) {
        a = 8;
        break;
      }
      b = (b + 4) | 0;
    }
    if ((a | 0) == 8) {
      i = e;
      return h | 0;
    }
    return 0;
  }
  function wj(a) {
    a = a | 0;
    return -1;
  }
  function xj(a) {
    a = a | 0;
    var b = 0,
      d = 0;
    b = i;
    if ((md[c[((c[a >> 2] | 0) + 36) >> 2] & 127](a) | 0) == -1) {
      a = -1;
      i = b;
      return a | 0;
    }
    d = (a + 12) | 0;
    a = c[d >> 2] | 0;
    c[d >> 2] = a + 4;
    a = c[a >> 2] | 0;
    i = b;
    return a | 0;
  }
  function yj(a, b) {
    a = a | 0;
    b = b | 0;
    return -1;
  }
  function zj(a, b, d) {
    a = a | 0;
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0;
    e = i;
    if ((d | 0) <= 0) {
      j = 0;
      i = e;
      return j | 0;
    }
    g = (a + 24) | 0;
    f = (a + 28) | 0;
    h = 0;
    while (1) {
      j = c[g >> 2] | 0;
      if (j >>> 0 >= (c[f >> 2] | 0) >>> 0) {
        if ((vd[c[((c[a >> 2] | 0) + 52) >> 2] & 63](a, c[b >> 2] | 0) | 0) == -1) {
          f = 8;
          break;
        }
      } else {
        k = c[b >> 2] | 0;
        c[g >> 2] = j + 4;
        c[j >> 2] = k;
      }
      h = (h + 1) | 0;
      if ((h | 0) >= (d | 0)) {
        f = 8;
        break;
      }
      b = (b + 4) | 0;
    }
    if ((f | 0) == 8) {
      i = e;
      return h | 0;
    }
    return 0;
  }
  function Aj(a, b) {
    a = a | 0;
    b = b | 0;
    return -1;
  }
  function Bj(a) {
    a = a | 0;
    var b = 0;
    b = i;
    _i((a + 8) | 0);
    Uq(a);
    i = b;
    return;
  }
  function Cj(a) {
    a = a | 0;
    var b = 0;
    b = i;
    _i((a + 8) | 0);
    i = b;
    return;
  }
  function Dj(a) {
    a = a | 0;
    var b = 0,
      d = 0;
    b = i;
    d = c[((c[a >> 2] | 0) + -12) >> 2] | 0;
    _i((a + (d + 8)) | 0);
    Uq((a + d) | 0);
    i = b;
    return;
  }
  function Ej(a) {
    a = a | 0;
    var b = 0;
    b = i;
    _i((a + ((c[((c[a >> 2] | 0) + -12) >> 2] | 0) + 8)) | 0);
    i = b;
    return;
  }
  function Fj(b) {
    b = b | 0;
    var d = 0,
      e = 0,
      f = 0;
    d = i;
    i = (i + 16) | 0;
    e = d;
    if (!(c[(b + ((c[((c[b >> 2] | 0) + -12) >> 2] | 0) + 24)) >> 2] | 0)) {
      i = d;
      return;
    }
    Pj(e, b);
    if (
      (a[e >> 0] | 0) != 0
        ? ((f = c[(b + ((c[((c[b >> 2] | 0) + -12) >> 2] | 0) + 24)) >> 2] | 0),
          (md[c[((c[f >> 2] | 0) + 24) >> 2] & 127](f) | 0) == -1)
        : 0
    ) {
      f = c[((c[b >> 2] | 0) + -12) >> 2] | 0;
      Zi((b + f) | 0, c[(b + (f + 16)) >> 2] | 1);
    }
    Qj(e);
    i = d;
    return;
  }
  function Gj(a) {
    a = a | 0;
    var b = 0;
    b = i;
    _i((a + 8) | 0);
    Uq(a);
    i = b;
    return;
  }
  function Hj(a) {
    a = a | 0;
    var b = 0;
    b = i;
    _i((a + 8) | 0);
    i = b;
    return;
  }
  function Ij(a) {
    a = a | 0;
    var b = 0,
      d = 0;
    b = i;
    d = c[((c[a >> 2] | 0) + -12) >> 2] | 0;
    _i((a + (d + 8)) | 0);
    Uq((a + d) | 0);
    i = b;
    return;
  }
  function Jj(a) {
    a = a | 0;
    var b = 0;
    b = i;
    _i((a + ((c[((c[a >> 2] | 0) + -12) >> 2] | 0) + 8)) | 0);
    i = b;
    return;
  }
  function Kj(b) {
    b = b | 0;
    var d = 0,
      e = 0,
      f = 0;
    d = i;
    i = (i + 16) | 0;
    e = d;
    f = c[((c[b >> 2] | 0) + -12) >> 2] | 0;
    if (!(c[(b + (f + 24)) >> 2] | 0)) {
      i = d;
      return;
    }
    a[e >> 0] = 0;
    c[(e + 4) >> 2] = b;
    if (!(c[(b + (f + 16)) >> 2] | 0)) {
      f = c[(b + (f + 72)) >> 2] | 0;
      if (f) Kj(f);
      a[e >> 0] = 1;
      f = c[(b + ((c[((c[b >> 2] | 0) + -12) >> 2] | 0) + 24)) >> 2] | 0;
      if ((md[c[((c[f >> 2] | 0) + 24) >> 2] & 127](f) | 0) == -1) {
        f = c[((c[b >> 2] | 0) + -12) >> 2] | 0;
        Zi((b + f) | 0, c[(b + (f + 16)) >> 2] | 1);
      }
    }
    Wj(e);
    i = d;
    return;
  }
  function Lj(a) {
    a = a | 0;
    var b = 0;
    b = i;
    _i((a + 4) | 0);
    Uq(a);
    i = b;
    return;
  }
  function Mj(a) {
    a = a | 0;
    var b = 0;
    b = i;
    _i((a + 4) | 0);
    i = b;
    return;
  }
  function Nj(a) {
    a = a | 0;
    var b = 0,
      d = 0;
    b = i;
    d = c[((c[a >> 2] | 0) + -12) >> 2] | 0;
    _i((a + (d + 4)) | 0);
    Uq((a + d) | 0);
    i = b;
    return;
  }
  function Oj(a) {
    a = a | 0;
    var b = 0;
    b = i;
    _i((a + ((c[((c[a >> 2] | 0) + -12) >> 2] | 0) + 4)) | 0);
    i = b;
    return;
  }
  function Pj(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0;
    e = i;
    a[b >> 0] = 0;
    c[(b + 4) >> 2] = d;
    f = c[((c[d >> 2] | 0) + -12) >> 2] | 0;
    if (c[(d + (f + 16)) >> 2] | 0) {
      i = e;
      return;
    }
    f = c[(d + (f + 72)) >> 2] | 0;
    if (f) Fj(f);
    a[b >> 0] = 1;
    i = e;
    return;
  }
  function Qj(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0;
    b = i;
    a = (a + 4) | 0;
    d = c[a >> 2] | 0;
    e = c[((c[d >> 2] | 0) + -12) >> 2] | 0;
    if (!(c[(d + (e + 24)) >> 2] | 0)) {
      i = b;
      return;
    }
    if (c[(d + (e + 16)) >> 2] | 0) {
      i = b;
      return;
    }
    if (!(c[(d + (e + 4)) >> 2] & 8192)) {
      i = b;
      return;
    }
    if (Ia() | 0) {
      i = b;
      return;
    }
    e = c[a >> 2] | 0;
    e = c[(e + ((c[((c[e >> 2] | 0) + -12) >> 2] | 0) + 24)) >> 2] | 0;
    if ((md[c[((c[e >> 2] | 0) + 24) >> 2] & 127](e) | 0) != -1) {
      i = b;
      return;
    }
    d = c[a >> 2] | 0;
    e = c[((c[d >> 2] | 0) + -12) >> 2] | 0;
    Zi((d + e) | 0, c[(d + (e + 16)) >> 2] | 1);
    i = b;
    return;
  }
  function Rj(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0;
    h = i;
    i = (i + 32) | 0;
    k = (h + 20) | 0;
    e = (h + 16) | 0;
    g = (h + 8) | 0;
    f = h;
    Pj(g, b);
    if (a[g >> 0] | 0) {
      l = c[(b + ((c[((c[b >> 2] | 0) + -12) >> 2] | 0) + 28)) >> 2] | 0;
      o = (l + 4) | 0;
      c[o >> 2] = (c[o >> 2] | 0) + 1;
      j = Sn(l, 17776) | 0;
      p = c[o >> 2] | 0;
      c[o >> 2] = p + -1;
      if (!p) jd[c[((c[l >> 2] | 0) + 8) >> 2] & 255](l);
      o = c[((c[b >> 2] | 0) + -12) >> 2] | 0;
      l = c[(b + (o + 24)) >> 2] | 0;
      m = (b + o) | 0;
      n = (b + (o + 76)) | 0;
      p = c[n >> 2] | 0;
      if ((p | 0) == -1) {
        p = c[(b + (o + 28)) >> 2] | 0;
        r = (p + 4) | 0;
        c[r >> 2] = (c[r >> 2] | 0) + 1;
        o = Sn(p, 19072) | 0;
        o = vd[c[((c[o >> 2] | 0) + 28) >> 2] & 63](o, 32) | 0;
        q = c[r >> 2] | 0;
        c[r >> 2] = q + -1;
        if (!q) jd[c[((c[p >> 2] | 0) + 8) >> 2] & 255](p);
        p = (o << 24) >> 24;
        c[n >> 2] = p;
      }
      r = p & 255;
      q = c[((c[j >> 2] | 0) + 16) >> 2] | 0;
      c[e >> 2] = l;
      c[(k + 0) >> 2] = c[(e + 0) >> 2];
      ud[q & 31](f, j, k, m, r, d);
      if (!(c[f >> 2] | 0)) {
        r = c[((c[b >> 2] | 0) + -12) >> 2] | 0;
        Zi((b + r) | 0, c[(b + (r + 16)) >> 2] | 5);
      }
    }
    Qj(g);
    i = h;
    return b | 0;
  }
  function Sj(a) {
    a = a | 0;
    var b = 0;
    b = i;
    _i((a + 4) | 0);
    Uq(a);
    i = b;
    return;
  }
  function Tj(a) {
    a = a | 0;
    var b = 0;
    b = i;
    _i((a + 4) | 0);
    i = b;
    return;
  }
  function Uj(a) {
    a = a | 0;
    var b = 0,
      d = 0;
    b = i;
    d = c[((c[a >> 2] | 0) + -12) >> 2] | 0;
    _i((a + (d + 4)) | 0);
    Uq((a + d) | 0);
    i = b;
    return;
  }
  function Vj(a) {
    a = a | 0;
    var b = 0;
    b = i;
    _i((a + ((c[((c[a >> 2] | 0) + -12) >> 2] | 0) + 4)) | 0);
    i = b;
    return;
  }
  function Wj(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0;
    b = i;
    a = (a + 4) | 0;
    d = c[a >> 2] | 0;
    e = c[((c[d >> 2] | 0) + -12) >> 2] | 0;
    if (!(c[(d + (e + 24)) >> 2] | 0)) {
      i = b;
      return;
    }
    if (c[(d + (e + 16)) >> 2] | 0) {
      i = b;
      return;
    }
    if (!(c[(d + (e + 4)) >> 2] & 8192)) {
      i = b;
      return;
    }
    if (Ia() | 0) {
      i = b;
      return;
    }
    e = c[a >> 2] | 0;
    e = c[(e + ((c[((c[e >> 2] | 0) + -12) >> 2] | 0) + 24)) >> 2] | 0;
    if ((md[c[((c[e >> 2] | 0) + 24) >> 2] & 127](e) | 0) != -1) {
      i = b;
      return;
    }
    d = c[a >> 2] | 0;
    e = c[((c[d >> 2] | 0) + -12) >> 2] | 0;
    Zi((d + e) | 0, c[(d + (e + 16)) >> 2] | 1);
    i = b;
    return;
  }
  function Xj(a) {
    a = a | 0;
    return 16528;
  }
  function Yj(b, d, e) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    var f = 0,
      g = 0;
    d = i;
    if (((e | 0) != 1) & ((e | 0) < 257)) {
      g = bd(e | 0) | 0;
      Gi(b, g, mr(g | 0) | 0);
      i = d;
      return;
    } else {
      e = $p(48) | 0;
      c[(b + 8) >> 2] = e;
      c[b >> 2] = 49;
      c[(b + 4) >> 2] = 35;
      g = (e + 0) | 0;
      f = 16544 | 0;
      b = (g + 35) | 0;
      do {
        a[g >> 0] = a[f >> 0] | 0;
        g = (g + 1) | 0;
        f = (f + 1) | 0;
      } while ((g | 0) < (b | 0));
      a[(e + 35) >> 0] = 0;
      i = d;
      return;
    }
  }
  function Zj(a) {
    a = a | 0;
    return;
  }
  function _j(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0,
      f = 0;
    b = i;
    c[a >> 2] = 27520;
    d = (a + 4) | 0;
    f = ((c[d >> 2] | 0) + -4) | 0;
    e = c[f >> 2] | 0;
    c[f >> 2] = e + -1;
    if (((e + -1) | 0) >= 0) {
      Uq(a);
      i = b;
      return;
    }
    Uq(((c[d >> 2] | 0) + -12) | 0);
    Uq(a);
    i = b;
    return;
  }
  function $j(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0;
    b = i;
    c[a >> 2] = 27520;
    a = (a + 4) | 0;
    e = ((c[a >> 2] | 0) + -4) | 0;
    d = c[e >> 2] | 0;
    c[e >> 2] = d + -1;
    if (((d + -1) | 0) >= 0) {
      i = b;
      return;
    }
    Uq(((c[a >> 2] | 0) + -12) | 0);
    i = b;
    return;
  }
  function ak(a) {
    a = a | 0;
    var b = 0;
    b = i;
    _i(a);
    Uq(a);
    i = b;
    return;
  }
  function bk(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function ck(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function dk(a) {
    a = a | 0;
    return;
  }
  function ek(a) {
    a = a | 0;
    return;
  }
  function fk(b, c, d, e, f) {
    b = b | 0;
    c = c | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    var g = 0,
      h = 0,
      j = 0;
    b = i;
    a: do
      if ((e | 0) == (f | 0)) g = 6;
      else
        while (1) {
          if ((c | 0) == (d | 0)) {
            d = -1;
            break a;
          }
          h = a[c >> 0] | 0;
          j = a[e >> 0] | 0;
          if ((h << 24) >> 24 < (j << 24) >> 24) {
            d = -1;
            break a;
          }
          if ((j << 24) >> 24 < (h << 24) >> 24) {
            d = 1;
            break a;
          }
          c = (c + 1) | 0;
          e = (e + 1) | 0;
          if ((e | 0) == (f | 0)) {
            g = 6;
            break;
          }
        }
    while (0);
    if ((g | 0) == 6) d = ((c | 0) != (d | 0)) & 1;
    i = b;
    return d | 0;
  }
  function gk(a, b, c, d) {
    a = a | 0;
    b = b | 0;
    c = c | 0;
    d = d | 0;
    b = i;
    Hi(a, c, d);
    i = b;
    return;
  }
  function hk(b, c, d) {
    b = b | 0;
    c = c | 0;
    d = d | 0;
    var e = 0,
      f = 0;
    b = i;
    if ((c | 0) == (d | 0)) {
      e = 0;
      i = b;
      return e | 0;
    } else e = 0;
    do {
      e = ((a[c >> 0] | 0) + (e << 4)) | 0;
      f = e & -268435456;
      e = ((f >>> 24) | f) ^ e;
      c = (c + 1) | 0;
    } while ((c | 0) != (d | 0));
    i = b;
    return e | 0;
  }
  function ik(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function jk(a) {
    a = a | 0;
    return;
  }
  function kk(a, b, d, e, f) {
    a = a | 0;
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    var g = 0,
      h = 0,
      j = 0;
    a = i;
    a: do
      if ((e | 0) == (f | 0)) g = 6;
      else
        while (1) {
          if ((b | 0) == (d | 0)) {
            d = -1;
            break a;
          }
          h = c[b >> 2] | 0;
          j = c[e >> 2] | 0;
          if ((h | 0) < (j | 0)) {
            d = -1;
            break a;
          }
          if ((j | 0) < (h | 0)) {
            d = 1;
            break a;
          }
          b = (b + 4) | 0;
          e = (e + 4) | 0;
          if ((e | 0) == (f | 0)) {
            g = 6;
            break;
          }
        }
    while (0);
    if ((g | 0) == 6) d = ((b | 0) != (d | 0)) & 1;
    i = a;
    return d | 0;
  }
  function lk(a, b, c, d) {
    a = a | 0;
    b = b | 0;
    c = c | 0;
    d = d | 0;
    b = i;
    Ti(a, c, d);
    i = b;
    return;
  }
  function mk(a, b, d) {
    a = a | 0;
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0;
    a = i;
    if ((b | 0) == (d | 0)) {
      e = 0;
      i = a;
      return e | 0;
    } else e = 0;
    do {
      e = ((c[b >> 2] | 0) + (e << 4)) | 0;
      f = e & -268435456;
      e = ((f >>> 24) | f) ^ e;
      b = (b + 4) | 0;
    } while ((b | 0) != (d | 0));
    i = a;
    return e | 0;
  }
  function nk(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function ok(a) {
    a = a | 0;
    return;
  }
  function pk(b, d, e, f, g, h, j) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    var k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0;
    k = i;
    i = (i + 64) | 0;
    o = (k + 8) | 0;
    p = (k + 40) | 0;
    m = (k + 44) | 0;
    n = (k + 48) | 0;
    r = (k + 4) | 0;
    q = k;
    l = (k + 16) | 0;
    if (!(c[(g + 4) >> 2] & 1)) {
      c[m >> 2] = -1;
      l = c[((c[d >> 2] | 0) + 16) >> 2] | 0;
      c[r >> 2] = c[e >> 2];
      c[q >> 2] = c[f >> 2];
      c[(p + 0) >> 2] = c[(r + 0) >> 2];
      c[(o + 0) >> 2] = c[(q + 0) >> 2];
      gd[l & 63](n, d, p, o, g, h, m);
      l = c[n >> 2] | 0;
      c[e >> 2] = l;
      e = c[m >> 2] | 0;
      if (!e) a[j >> 0] = 0;
      else if ((e | 0) == 1) a[j >> 0] = 1;
      else {
        a[j >> 0] = 1;
        c[h >> 2] = 4;
      }
      c[b >> 2] = l;
      i = k;
      return;
    }
    d = (g + 28) | 0;
    n = c[d >> 2] | 0;
    m = (n + 4) | 0;
    c[m >> 2] = (c[m >> 2] | 0) + 1;
    m = Sn(n, 19072) | 0;
    r = (n + 4) | 0;
    g = c[r >> 2] | 0;
    c[r >> 2] = g + -1;
    if (!g) jd[c[((c[n >> 2] | 0) + 8) >> 2] & 255](n);
    n = c[d >> 2] | 0;
    d = (n + 4) | 0;
    c[d >> 2] = (c[d >> 2] | 0) + 1;
    d = Sn(n, 19216) | 0;
    r = (n + 4) | 0;
    g = c[r >> 2] | 0;
    c[r >> 2] = g + -1;
    if (!g) jd[c[((c[n >> 2] | 0) + 8) >> 2] & 255](n);
    kd[c[((c[d >> 2] | 0) + 24) >> 2] & 63](l, d);
    g = (l + 12) | 0;
    kd[c[((c[d >> 2] | 0) + 28) >> 2] & 63](g, d);
    a[j >> 0] = ((qk(e, c[f >> 2] | 0, l, (l + 24) | 0, m, h, 1) | 0) == (l | 0)) & 1;
    c[b >> 2] = c[e >> 2];
    if (a[g >> 0] & 1) Uq(c[(l + 20) >> 2] | 0);
    if (!(a[l >> 0] & 1)) {
      i = k;
      return;
    }
    Uq(c[(l + 8) >> 2] | 0);
    i = k;
    return;
  }
  function qk(b, e, f, g, h, j, k) {
    b = b | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    k = k | 0;
    var l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0,
      y = 0;
    n = i;
    i = (i + 112) | 0;
    o = n;
    s = (((g - f) | 0) / 12) | 0;
    if (s >>> 0 > 100) {
      o = Tq(s) | 0;
      if (!o) {
        y = Wb(4) | 0;
        c[y >> 2] = 27280;
        Zc(y | 0, 27328, 220);
      } else l = o;
    } else l = 0;
    p = (f | 0) == (g | 0);
    if (p) t = 0;
    else {
      q = f;
      t = 0;
      r = o;
      while (1) {
        u = a[q >> 0] | 0;
        if (!(u & 1)) u = (u & 255) >>> 1;
        else u = c[(q + 4) >> 2] | 0;
        if (!u) {
          a[r >> 0] = 2;
          t = (t + 1) | 0;
          s = (s + -1) | 0;
        } else a[r >> 0] = 1;
        q = (q + 12) | 0;
        if ((q | 0) == (g | 0)) break;
        else r = (r + 1) | 0;
      }
    }
    q = 0;
    a: while (1) {
      v = (s | 0) != 0;
      r = q;
      while (1) {
        q = c[b >> 2] | 0;
        do
          if (q) {
            if ((c[(q + 12) >> 2] | 0) == (c[(q + 16) >> 2] | 0))
              if ((md[c[((c[q >> 2] | 0) + 36) >> 2] & 127](q) | 0) == -1) {
                c[b >> 2] = 0;
                q = 0;
                break;
              } else {
                q = c[b >> 2] | 0;
                break;
              }
          } else q = 0;
        while (0);
        x = (q | 0) == 0;
        if (e)
          if ((c[(e + 12) >> 2] | 0) == (c[(e + 16) >> 2] | 0)) {
            y = (md[c[((c[e >> 2] | 0) + 36) >> 2] & 127](e) | 0) == -1;
            q = y ? 0 : e;
            e = y ? 0 : e;
          } else q = e;
        else {
          q = 0;
          e = 0;
        }
        u = (q | 0) == 0;
        w = c[b >> 2] | 0;
        if (!((x ^ u) & v)) break a;
        q = c[(w + 12) >> 2] | 0;
        if ((q | 0) == (c[(w + 16) >> 2] | 0)) q = md[c[((c[w >> 2] | 0) + 36) >> 2] & 127](w) | 0;
        else q = d[q >> 0] | 0;
        u = q & 255;
        if (!k) u = vd[c[((c[h >> 2] | 0) + 12) >> 2] & 63](h, u) | 0;
        q = (r + 1) | 0;
        if (p) r = q;
        else {
          x = 0;
          v = f;
          w = o;
          break;
        }
      }
      while (1) {
        do
          if ((a[w >> 0] | 0) == 1) {
            if (!(a[v >> 0] & 1)) y = (v + 1) | 0;
            else y = c[(v + 8) >> 2] | 0;
            y = a[(y + r) >> 0] | 0;
            if (!k) y = vd[c[((c[h >> 2] | 0) + 12) >> 2] & 63](h, y) | 0;
            if ((u << 24) >> 24 != (y << 24) >> 24) {
              a[w >> 0] = 0;
              s = (s + -1) | 0;
              break;
            }
            x = a[v >> 0] | 0;
            if (!(x & 1)) x = (x & 255) >>> 1;
            else x = c[(v + 4) >> 2] | 0;
            if ((x | 0) == (q | 0)) {
              a[w >> 0] = 2;
              x = 1;
              t = (t + 1) | 0;
              s = (s + -1) | 0;
            } else x = 1;
          }
        while (0);
        v = (v + 12) | 0;
        if ((v | 0) == (g | 0)) break;
        w = (w + 1) | 0;
      }
      if (!x) continue;
      r = c[b >> 2] | 0;
      u = (r + 12) | 0;
      v = c[u >> 2] | 0;
      if ((v | 0) == (c[(r + 16) >> 2] | 0)) md[c[((c[r >> 2] | 0) + 40) >> 2] & 127](r) | 0;
      else c[u >> 2] = v + 1;
      if (((t + s) | 0) >>> 0 < 2) continue;
      else {
        r = f;
        u = o;
      }
      while (1) {
        if ((a[u >> 0] | 0) == 2) {
          v = a[r >> 0] | 0;
          if (!(v & 1)) v = (v & 255) >>> 1;
          else v = c[(r + 4) >> 2] | 0;
          if ((v | 0) != (q | 0)) {
            a[u >> 0] = 0;
            t = (t + -1) | 0;
          }
        }
        r = (r + 12) | 0;
        if ((r | 0) == (g | 0)) continue a;
        else u = (u + 1) | 0;
      }
    }
    do
      if (w) {
        if ((c[(w + 12) >> 2] | 0) == (c[(w + 16) >> 2] | 0))
          if ((md[c[((c[w >> 2] | 0) + 36) >> 2] & 127](w) | 0) == -1) {
            c[b >> 2] = 0;
            w = 0;
            break;
          } else {
            w = c[b >> 2] | 0;
            break;
          }
      } else w = 0;
    while (0);
    k = (w | 0) == 0;
    do
      if (!u) {
        if ((c[(q + 12) >> 2] | 0) != (c[(q + 16) >> 2] | 0))
          if (k) break;
          else {
            m = 72;
            break;
          }
        if ((md[c[((c[q >> 2] | 0) + 36) >> 2] & 127](q) | 0) != -1) {
          if (!k) m = 72;
        } else m = 70;
      } else m = 70;
    while (0);
    if ((m | 0) == 70 ? k : 0) m = 72;
    if ((m | 0) == 72) c[j >> 2] = c[j >> 2] | 2;
    b: do
      if (!p)
        if ((a[o >> 0] | 0) == 2) g = f;
        else
          while (1) {
            f = (f + 12) | 0;
            o = (o + 1) | 0;
            if ((f | 0) == (g | 0)) {
              m = 77;
              break b;
            }
            if ((a[o >> 0] | 0) == 2) {
              g = f;
              break;
            }
          }
      else m = 77;
    while (0);
    if ((m | 0) == 77) c[j >> 2] = c[j >> 2] | 4;
    if (!l) {
      i = n;
      return g | 0;
    }
    Uq(l);
    i = n;
    return g | 0;
  }
  function rk(b, e, f, g, h, j, k) {
    b = b | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    k = k | 0;
    var l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0,
      y = 0,
      z = 0,
      A = 0,
      B = 0,
      C = 0;
    m = i;
    i = (i + 224) | 0;
    t = (m + 198) | 0;
    w = (m + 196) | 0;
    e = (m + 16) | 0;
    n = (m + 4) | 0;
    r = (m + 192) | 0;
    s = (m + 32) | 0;
    p = m;
    q = (m + 28) | 0;
    v = c[f >> 2] | 0;
    y = c[g >> 2] | 0;
    g = c[(h + 4) >> 2] & 74;
    if ((g | 0) == 8) g = 16;
    else if (!g) g = 0;
    else if ((g | 0) == 64) g = 8;
    else g = 10;
    Tk(e, h, t, w);
    c[(n + 0) >> 2] = 0;
    c[(n + 4) >> 2] = 0;
    c[(n + 8) >> 2] = 0;
    Ki(n, 10);
    if (!(a[n >> 0] & 1)) {
      z = (n + 1) | 0;
      h = z;
      u = (n + 8) | 0;
    } else {
      z = (n + 8) | 0;
      h = (n + 1) | 0;
      u = z;
      z = c[z >> 2] | 0;
    }
    c[r >> 2] = z;
    c[p >> 2] = s;
    c[q >> 2] = 0;
    f = (n + 4) | 0;
    w = a[w >> 0] | 0;
    a: while (1) {
      if (v) {
        if ((c[(v + 12) >> 2] | 0) == (c[(v + 16) >> 2] | 0)) {
          C = (md[c[((c[v >> 2] | 0) + 36) >> 2] & 127](v) | 0) == -1;
          v = C ? 0 : v;
        }
      } else v = 0;
      x = (v | 0) == 0;
      do
        if (y) {
          if ((c[(y + 12) >> 2] | 0) != (c[(y + 16) >> 2] | 0))
            if (x) break;
            else break a;
          if ((md[c[((c[y >> 2] | 0) + 36) >> 2] & 127](y) | 0) != -1) {
            if (!x) break a;
          } else l = 19;
        } else l = 19;
      while (0);
      if ((l | 0) == 19) {
        l = 0;
        if (x) {
          y = 0;
          break;
        } else y = 0;
      }
      C = a[n >> 0] | 0;
      B = (C & 1) == 0;
      if (B) A = (C & 255) >>> 1;
      else A = c[f >> 2] | 0;
      if ((c[r >> 2] | 0) == ((z + A) | 0)) {
        if (B) A = (C & 255) >>> 1;
        else A = c[f >> 2] | 0;
        Ki(n, A << 1);
        if (!(a[n >> 0] & 1)) z = 10;
        else z = ((c[n >> 2] & -2) + -1) | 0;
        Ki(n, z);
        if (!(a[n >> 0] & 1)) z = h;
        else z = c[u >> 2] | 0;
        c[r >> 2] = z + A;
      }
      A = (v + 12) | 0;
      C = c[A >> 2] | 0;
      B = (v + 16) | 0;
      if ((C | 0) == (c[B >> 2] | 0)) C = md[c[((c[v >> 2] | 0) + 36) >> 2] & 127](v) | 0;
      else C = d[C >> 0] | 0;
      if (Bk(C & 255, g, z, r, q, w, e, s, p, t) | 0) break;
      x = c[A >> 2] | 0;
      if ((x | 0) == (c[B >> 2] | 0)) {
        md[c[((c[v >> 2] | 0) + 40) >> 2] & 127](v) | 0;
        continue;
      } else {
        c[A >> 2] = x + 1;
        continue;
      }
    }
    t = a[e >> 0] | 0;
    if (!(t & 1)) t = (t & 255) >>> 1;
    else t = c[(e + 4) >> 2] | 0;
    if ((t | 0) != 0 ? ((o = c[p >> 2] | 0), ((o - s) | 0) < 160) : 0) {
      C = c[q >> 2] | 0;
      c[p >> 2] = o + 4;
      c[o >> 2] = C;
    }
    c[k >> 2] = Ip(z, c[r >> 2] | 0, j, g) | 0;
    hn(e, s, c[p >> 2] | 0, j);
    if (!x) {
      if ((c[(v + 12) >> 2] | 0) == (c[(v + 16) >> 2] | 0)) {
        C = (md[c[((c[v >> 2] | 0) + 36) >> 2] & 127](v) | 0) == -1;
        v = C ? 0 : v;
      }
    } else v = 0;
    k = (v | 0) == 0;
    do
      if (y) {
        if ((c[(y + 12) >> 2] | 0) != (c[(y + 16) >> 2] | 0))
          if (k) break;
          else {
            l = 60;
            break;
          }
        if ((md[c[((c[y >> 2] | 0) + 36) >> 2] & 127](y) | 0) != -1) {
          if (!k) l = 60;
        } else l = 58;
      } else l = 58;
    while (0);
    if ((l | 0) == 58 ? k : 0) l = 60;
    if ((l | 0) == 60) c[j >> 2] = c[j >> 2] | 2;
    c[b >> 2] = v;
    if (a[n >> 0] & 1) Uq(c[(n + 8) >> 2] | 0);
    if (!(a[e >> 0] & 1)) {
      i = m;
      return;
    }
    Uq(c[(e + 8) >> 2] | 0);
    i = m;
    return;
  }
  function sk(b, e, f, g, h, j, k) {
    b = b | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    k = k | 0;
    var l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0,
      y = 0,
      z = 0,
      A = 0,
      B = 0,
      C = 0;
    m = i;
    i = (i + 224) | 0;
    t = (m + 198) | 0;
    w = (m + 196) | 0;
    e = (m + 16) | 0;
    n = (m + 4) | 0;
    r = (m + 192) | 0;
    s = (m + 32) | 0;
    p = m;
    q = (m + 28) | 0;
    v = c[f >> 2] | 0;
    y = c[g >> 2] | 0;
    g = c[(h + 4) >> 2] & 74;
    if ((g | 0) == 64) g = 8;
    else if (!g) g = 0;
    else if ((g | 0) == 8) g = 16;
    else g = 10;
    Tk(e, h, t, w);
    c[(n + 0) >> 2] = 0;
    c[(n + 4) >> 2] = 0;
    c[(n + 8) >> 2] = 0;
    Ki(n, 10);
    if (!(a[n >> 0] & 1)) {
      z = (n + 1) | 0;
      h = z;
      u = (n + 8) | 0;
    } else {
      z = (n + 8) | 0;
      h = (n + 1) | 0;
      u = z;
      z = c[z >> 2] | 0;
    }
    c[r >> 2] = z;
    c[p >> 2] = s;
    c[q >> 2] = 0;
    f = (n + 4) | 0;
    w = a[w >> 0] | 0;
    a: while (1) {
      if (v) {
        if ((c[(v + 12) >> 2] | 0) == (c[(v + 16) >> 2] | 0)) {
          C = (md[c[((c[v >> 2] | 0) + 36) >> 2] & 127](v) | 0) == -1;
          v = C ? 0 : v;
        }
      } else v = 0;
      x = (v | 0) == 0;
      do
        if (y) {
          if ((c[(y + 12) >> 2] | 0) != (c[(y + 16) >> 2] | 0))
            if (x) break;
            else break a;
          if ((md[c[((c[y >> 2] | 0) + 36) >> 2] & 127](y) | 0) != -1) {
            if (!x) break a;
          } else l = 19;
        } else l = 19;
      while (0);
      if ((l | 0) == 19) {
        l = 0;
        if (x) {
          y = 0;
          break;
        } else y = 0;
      }
      C = a[n >> 0] | 0;
      B = (C & 1) == 0;
      if (B) A = (C & 255) >>> 1;
      else A = c[f >> 2] | 0;
      if ((c[r >> 2] | 0) == ((z + A) | 0)) {
        if (B) A = (C & 255) >>> 1;
        else A = c[f >> 2] | 0;
        Ki(n, A << 1);
        if (!(a[n >> 0] & 1)) z = 10;
        else z = ((c[n >> 2] & -2) + -1) | 0;
        Ki(n, z);
        if (!(a[n >> 0] & 1)) z = h;
        else z = c[u >> 2] | 0;
        c[r >> 2] = z + A;
      }
      A = (v + 12) | 0;
      C = c[A >> 2] | 0;
      B = (v + 16) | 0;
      if ((C | 0) == (c[B >> 2] | 0)) C = md[c[((c[v >> 2] | 0) + 36) >> 2] & 127](v) | 0;
      else C = d[C >> 0] | 0;
      if (Bk(C & 255, g, z, r, q, w, e, s, p, t) | 0) break;
      x = c[A >> 2] | 0;
      if ((x | 0) == (c[B >> 2] | 0)) {
        md[c[((c[v >> 2] | 0) + 40) >> 2] & 127](v) | 0;
        continue;
      } else {
        c[A >> 2] = x + 1;
        continue;
      }
    }
    t = a[e >> 0] | 0;
    if (!(t & 1)) t = (t & 255) >>> 1;
    else t = c[(e + 4) >> 2] | 0;
    if ((t | 0) != 0 ? ((o = c[p >> 2] | 0), ((o - s) | 0) < 160) : 0) {
      C = c[q >> 2] | 0;
      c[p >> 2] = o + 4;
      c[o >> 2] = C;
    }
    B = Hp(z, c[r >> 2] | 0, j, g) | 0;
    C = k;
    c[C >> 2] = B;
    c[(C + 4) >> 2] = H;
    hn(e, s, c[p >> 2] | 0, j);
    if (!x) {
      if ((c[(v + 12) >> 2] | 0) == (c[(v + 16) >> 2] | 0)) {
        C = (md[c[((c[v >> 2] | 0) + 36) >> 2] & 127](v) | 0) == -1;
        v = C ? 0 : v;
      }
    } else v = 0;
    k = (v | 0) == 0;
    do
      if (y) {
        if ((c[(y + 12) >> 2] | 0) != (c[(y + 16) >> 2] | 0))
          if (k) break;
          else {
            l = 60;
            break;
          }
        if ((md[c[((c[y >> 2] | 0) + 36) >> 2] & 127](y) | 0) != -1) {
          if (!k) l = 60;
        } else l = 58;
      } else l = 58;
    while (0);
    if ((l | 0) == 58 ? k : 0) l = 60;
    if ((l | 0) == 60) c[j >> 2] = c[j >> 2] | 2;
    c[b >> 2] = v;
    if (a[n >> 0] & 1) Uq(c[(n + 8) >> 2] | 0);
    if (!(a[e >> 0] & 1)) {
      i = m;
      return;
    }
    Uq(c[(e + 8) >> 2] | 0);
    i = m;
    return;
  }
  function tk(e, f, g, h, j, k, l) {
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    k = k | 0;
    l = l | 0;
    var m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0,
      y = 0,
      z = 0,
      A = 0,
      B = 0,
      C = 0,
      D = 0;
    n = i;
    i = (i + 224) | 0;
    u = (n + 198) | 0;
    x = (n + 196) | 0;
    f = (n + 16) | 0;
    o = (n + 4) | 0;
    s = (n + 192) | 0;
    t = (n + 32) | 0;
    q = n;
    r = (n + 28) | 0;
    w = c[g >> 2] | 0;
    z = c[h >> 2] | 0;
    h = c[(j + 4) >> 2] & 74;
    if ((h | 0) == 8) h = 16;
    else if ((h | 0) == 64) h = 8;
    else if (!h) h = 0;
    else h = 10;
    Tk(f, j, u, x);
    c[(o + 0) >> 2] = 0;
    c[(o + 4) >> 2] = 0;
    c[(o + 8) >> 2] = 0;
    Ki(o, 10);
    if (!(a[o >> 0] & 1)) {
      A = (o + 1) | 0;
      j = A;
      v = (o + 8) | 0;
    } else {
      A = (o + 8) | 0;
      j = (o + 1) | 0;
      v = A;
      A = c[A >> 2] | 0;
    }
    c[s >> 2] = A;
    c[q >> 2] = t;
    c[r >> 2] = 0;
    g = (o + 4) | 0;
    x = a[x >> 0] | 0;
    a: while (1) {
      if (w) {
        if ((c[(w + 12) >> 2] | 0) == (c[(w + 16) >> 2] | 0)) {
          D = (md[c[((c[w >> 2] | 0) + 36) >> 2] & 127](w) | 0) == -1;
          w = D ? 0 : w;
        }
      } else w = 0;
      y = (w | 0) == 0;
      do
        if (z) {
          if ((c[(z + 12) >> 2] | 0) != (c[(z + 16) >> 2] | 0))
            if (y) break;
            else break a;
          if ((md[c[((c[z >> 2] | 0) + 36) >> 2] & 127](z) | 0) != -1) {
            if (!y) break a;
          } else m = 19;
        } else m = 19;
      while (0);
      if ((m | 0) == 19) {
        m = 0;
        if (y) {
          z = 0;
          break;
        } else z = 0;
      }
      D = a[o >> 0] | 0;
      C = (D & 1) == 0;
      if (C) B = (D & 255) >>> 1;
      else B = c[g >> 2] | 0;
      if ((c[s >> 2] | 0) == ((A + B) | 0)) {
        if (C) B = (D & 255) >>> 1;
        else B = c[g >> 2] | 0;
        Ki(o, B << 1);
        if (!(a[o >> 0] & 1)) A = 10;
        else A = ((c[o >> 2] & -2) + -1) | 0;
        Ki(o, A);
        if (!(a[o >> 0] & 1)) A = j;
        else A = c[v >> 2] | 0;
        c[s >> 2] = A + B;
      }
      B = (w + 12) | 0;
      D = c[B >> 2] | 0;
      C = (w + 16) | 0;
      if ((D | 0) == (c[C >> 2] | 0)) D = md[c[((c[w >> 2] | 0) + 36) >> 2] & 127](w) | 0;
      else D = d[D >> 0] | 0;
      if (Bk(D & 255, h, A, s, r, x, f, t, q, u) | 0) break;
      y = c[B >> 2] | 0;
      if ((y | 0) == (c[C >> 2] | 0)) {
        md[c[((c[w >> 2] | 0) + 40) >> 2] & 127](w) | 0;
        continue;
      } else {
        c[B >> 2] = y + 1;
        continue;
      }
    }
    u = a[f >> 0] | 0;
    if (!(u & 1)) u = (u & 255) >>> 1;
    else u = c[(f + 4) >> 2] | 0;
    if ((u | 0) != 0 ? ((p = c[q >> 2] | 0), ((p - t) | 0) < 160) : 0) {
      D = c[r >> 2] | 0;
      c[q >> 2] = p + 4;
      c[p >> 2] = D;
    }
    b[l >> 1] = Gp(A, c[s >> 2] | 0, k, h) | 0;
    hn(f, t, c[q >> 2] | 0, k);
    if (!y) {
      if ((c[(w + 12) >> 2] | 0) == (c[(w + 16) >> 2] | 0)) {
        D = (md[c[((c[w >> 2] | 0) + 36) >> 2] & 127](w) | 0) == -1;
        w = D ? 0 : w;
      }
    } else w = 0;
    l = (w | 0) == 0;
    do
      if (z) {
        if ((c[(z + 12) >> 2] | 0) != (c[(z + 16) >> 2] | 0))
          if (l) break;
          else {
            m = 60;
            break;
          }
        if ((md[c[((c[z >> 2] | 0) + 36) >> 2] & 127](z) | 0) != -1) {
          if (!l) m = 60;
        } else m = 58;
      } else m = 58;
    while (0);
    if ((m | 0) == 58 ? l : 0) m = 60;
    if ((m | 0) == 60) c[k >> 2] = c[k >> 2] | 2;
    c[e >> 2] = w;
    if (a[o >> 0] & 1) Uq(c[(o + 8) >> 2] | 0);
    if (!(a[f >> 0] & 1)) {
      i = n;
      return;
    }
    Uq(c[(f + 8) >> 2] | 0);
    i = n;
    return;
  }
  function uk(b, e, f, g, h, j, k) {
    b = b | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    k = k | 0;
    var l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0,
      y = 0,
      z = 0,
      A = 0,
      B = 0,
      C = 0;
    m = i;
    i = (i + 224) | 0;
    t = (m + 198) | 0;
    w = (m + 196) | 0;
    e = (m + 16) | 0;
    n = (m + 4) | 0;
    r = (m + 192) | 0;
    s = (m + 32) | 0;
    p = m;
    q = (m + 28) | 0;
    v = c[f >> 2] | 0;
    y = c[g >> 2] | 0;
    g = c[(h + 4) >> 2] & 74;
    if ((g | 0) == 64) g = 8;
    else if (!g) g = 0;
    else if ((g | 0) == 8) g = 16;
    else g = 10;
    Tk(e, h, t, w);
    c[(n + 0) >> 2] = 0;
    c[(n + 4) >> 2] = 0;
    c[(n + 8) >> 2] = 0;
    Ki(n, 10);
    if (!(a[n >> 0] & 1)) {
      z = (n + 1) | 0;
      h = z;
      u = (n + 8) | 0;
    } else {
      z = (n + 8) | 0;
      h = (n + 1) | 0;
      u = z;
      z = c[z >> 2] | 0;
    }
    c[r >> 2] = z;
    c[p >> 2] = s;
    c[q >> 2] = 0;
    f = (n + 4) | 0;
    w = a[w >> 0] | 0;
    a: while (1) {
      if (v) {
        if ((c[(v + 12) >> 2] | 0) == (c[(v + 16) >> 2] | 0)) {
          C = (md[c[((c[v >> 2] | 0) + 36) >> 2] & 127](v) | 0) == -1;
          v = C ? 0 : v;
        }
      } else v = 0;
      x = (v | 0) == 0;
      do
        if (y) {
          if ((c[(y + 12) >> 2] | 0) != (c[(y + 16) >> 2] | 0))
            if (x) break;
            else break a;
          if ((md[c[((c[y >> 2] | 0) + 36) >> 2] & 127](y) | 0) != -1) {
            if (!x) break a;
          } else l = 19;
        } else l = 19;
      while (0);
      if ((l | 0) == 19) {
        l = 0;
        if (x) {
          y = 0;
          break;
        } else y = 0;
      }
      C = a[n >> 0] | 0;
      B = (C & 1) == 0;
      if (B) A = (C & 255) >>> 1;
      else A = c[f >> 2] | 0;
      if ((c[r >> 2] | 0) == ((z + A) | 0)) {
        if (B) A = (C & 255) >>> 1;
        else A = c[f >> 2] | 0;
        Ki(n, A << 1);
        if (!(a[n >> 0] & 1)) z = 10;
        else z = ((c[n >> 2] & -2) + -1) | 0;
        Ki(n, z);
        if (!(a[n >> 0] & 1)) z = h;
        else z = c[u >> 2] | 0;
        c[r >> 2] = z + A;
      }
      A = (v + 12) | 0;
      C = c[A >> 2] | 0;
      B = (v + 16) | 0;
      if ((C | 0) == (c[B >> 2] | 0)) C = md[c[((c[v >> 2] | 0) + 36) >> 2] & 127](v) | 0;
      else C = d[C >> 0] | 0;
      if (Bk(C & 255, g, z, r, q, w, e, s, p, t) | 0) break;
      x = c[A >> 2] | 0;
      if ((x | 0) == (c[B >> 2] | 0)) {
        md[c[((c[v >> 2] | 0) + 40) >> 2] & 127](v) | 0;
        continue;
      } else {
        c[A >> 2] = x + 1;
        continue;
      }
    }
    t = a[e >> 0] | 0;
    if (!(t & 1)) t = (t & 255) >>> 1;
    else t = c[(e + 4) >> 2] | 0;
    if ((t | 0) != 0 ? ((o = c[p >> 2] | 0), ((o - s) | 0) < 160) : 0) {
      C = c[q >> 2] | 0;
      c[p >> 2] = o + 4;
      c[o >> 2] = C;
    }
    c[k >> 2] = Fp(z, c[r >> 2] | 0, j, g) | 0;
    hn(e, s, c[p >> 2] | 0, j);
    if (!x) {
      if ((c[(v + 12) >> 2] | 0) == (c[(v + 16) >> 2] | 0)) {
        C = (md[c[((c[v >> 2] | 0) + 36) >> 2] & 127](v) | 0) == -1;
        v = C ? 0 : v;
      }
    } else v = 0;
    k = (v | 0) == 0;
    do
      if (y) {
        if ((c[(y + 12) >> 2] | 0) != (c[(y + 16) >> 2] | 0))
          if (k) break;
          else {
            l = 60;
            break;
          }
        if ((md[c[((c[y >> 2] | 0) + 36) >> 2] & 127](y) | 0) != -1) {
          if (!k) l = 60;
        } else l = 58;
      } else l = 58;
    while (0);
    if ((l | 0) == 58 ? k : 0) l = 60;
    if ((l | 0) == 60) c[j >> 2] = c[j >> 2] | 2;
    c[b >> 2] = v;
    if (a[n >> 0] & 1) Uq(c[(n + 8) >> 2] | 0);
    if (!(a[e >> 0] & 1)) {
      i = m;
      return;
    }
    Uq(c[(e + 8) >> 2] | 0);
    i = m;
    return;
  }
  function vk(b, e, f, g, h, j, k) {
    b = b | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    k = k | 0;
    var l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0,
      y = 0,
      z = 0,
      A = 0,
      B = 0,
      C = 0;
    m = i;
    i = (i + 224) | 0;
    t = (m + 198) | 0;
    w = (m + 196) | 0;
    e = (m + 16) | 0;
    n = (m + 4) | 0;
    r = (m + 192) | 0;
    s = (m + 32) | 0;
    p = m;
    q = (m + 28) | 0;
    v = c[f >> 2] | 0;
    y = c[g >> 2] | 0;
    g = c[(h + 4) >> 2] & 74;
    if ((g | 0) == 8) g = 16;
    else if ((g | 0) == 64) g = 8;
    else if (!g) g = 0;
    else g = 10;
    Tk(e, h, t, w);
    c[(n + 0) >> 2] = 0;
    c[(n + 4) >> 2] = 0;
    c[(n + 8) >> 2] = 0;
    Ki(n, 10);
    if (!(a[n >> 0] & 1)) {
      z = (n + 1) | 0;
      h = z;
      u = (n + 8) | 0;
    } else {
      z = (n + 8) | 0;
      h = (n + 1) | 0;
      u = z;
      z = c[z >> 2] | 0;
    }
    c[r >> 2] = z;
    c[p >> 2] = s;
    c[q >> 2] = 0;
    f = (n + 4) | 0;
    w = a[w >> 0] | 0;
    a: while (1) {
      if (v) {
        if ((c[(v + 12) >> 2] | 0) == (c[(v + 16) >> 2] | 0)) {
          C = (md[c[((c[v >> 2] | 0) + 36) >> 2] & 127](v) | 0) == -1;
          v = C ? 0 : v;
        }
      } else v = 0;
      x = (v | 0) == 0;
      do
        if (y) {
          if ((c[(y + 12) >> 2] | 0) != (c[(y + 16) >> 2] | 0))
            if (x) break;
            else break a;
          if ((md[c[((c[y >> 2] | 0) + 36) >> 2] & 127](y) | 0) != -1) {
            if (!x) break a;
          } else l = 19;
        } else l = 19;
      while (0);
      if ((l | 0) == 19) {
        l = 0;
        if (x) {
          y = 0;
          break;
        } else y = 0;
      }
      C = a[n >> 0] | 0;
      B = (C & 1) == 0;
      if (B) A = (C & 255) >>> 1;
      else A = c[f >> 2] | 0;
      if ((c[r >> 2] | 0) == ((z + A) | 0)) {
        if (B) A = (C & 255) >>> 1;
        else A = c[f >> 2] | 0;
        Ki(n, A << 1);
        if (!(a[n >> 0] & 1)) z = 10;
        else z = ((c[n >> 2] & -2) + -1) | 0;
        Ki(n, z);
        if (!(a[n >> 0] & 1)) z = h;
        else z = c[u >> 2] | 0;
        c[r >> 2] = z + A;
      }
      A = (v + 12) | 0;
      C = c[A >> 2] | 0;
      B = (v + 16) | 0;
      if ((C | 0) == (c[B >> 2] | 0)) C = md[c[((c[v >> 2] | 0) + 36) >> 2] & 127](v) | 0;
      else C = d[C >> 0] | 0;
      if (Bk(C & 255, g, z, r, q, w, e, s, p, t) | 0) break;
      x = c[A >> 2] | 0;
      if ((x | 0) == (c[B >> 2] | 0)) {
        md[c[((c[v >> 2] | 0) + 40) >> 2] & 127](v) | 0;
        continue;
      } else {
        c[A >> 2] = x + 1;
        continue;
      }
    }
    t = a[e >> 0] | 0;
    if (!(t & 1)) t = (t & 255) >>> 1;
    else t = c[(e + 4) >> 2] | 0;
    if ((t | 0) != 0 ? ((o = c[p >> 2] | 0), ((o - s) | 0) < 160) : 0) {
      C = c[q >> 2] | 0;
      c[p >> 2] = o + 4;
      c[o >> 2] = C;
    }
    c[k >> 2] = Ep(z, c[r >> 2] | 0, j, g) | 0;
    hn(e, s, c[p >> 2] | 0, j);
    if (!x) {
      if ((c[(v + 12) >> 2] | 0) == (c[(v + 16) >> 2] | 0)) {
        C = (md[c[((c[v >> 2] | 0) + 36) >> 2] & 127](v) | 0) == -1;
        v = C ? 0 : v;
      }
    } else v = 0;
    k = (v | 0) == 0;
    do
      if (y) {
        if ((c[(y + 12) >> 2] | 0) != (c[(y + 16) >> 2] | 0))
          if (k) break;
          else {
            l = 60;
            break;
          }
        if ((md[c[((c[y >> 2] | 0) + 36) >> 2] & 127](y) | 0) != -1) {
          if (!k) l = 60;
        } else l = 58;
      } else l = 58;
    while (0);
    if ((l | 0) == 58 ? k : 0) l = 60;
    if ((l | 0) == 60) c[j >> 2] = c[j >> 2] | 2;
    c[b >> 2] = v;
    if (a[n >> 0] & 1) Uq(c[(n + 8) >> 2] | 0);
    if (!(a[e >> 0] & 1)) {
      i = m;
      return;
    }
    Uq(c[(e + 8) >> 2] | 0);
    i = m;
    return;
  }
  function wk(b, e, f, g, h, j, k) {
    b = b | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    k = k | 0;
    var l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0,
      y = 0,
      z = 0,
      A = 0,
      B = 0,
      C = 0;
    m = i;
    i = (i + 224) | 0;
    t = (m + 198) | 0;
    w = (m + 196) | 0;
    e = (m + 16) | 0;
    n = (m + 4) | 0;
    r = (m + 192) | 0;
    s = (m + 32) | 0;
    p = m;
    q = (m + 28) | 0;
    v = c[f >> 2] | 0;
    y = c[g >> 2] | 0;
    g = c[(h + 4) >> 2] & 74;
    if ((g | 0) == 64) g = 8;
    else if (!g) g = 0;
    else if ((g | 0) == 8) g = 16;
    else g = 10;
    Tk(e, h, t, w);
    c[(n + 0) >> 2] = 0;
    c[(n + 4) >> 2] = 0;
    c[(n + 8) >> 2] = 0;
    Ki(n, 10);
    if (!(a[n >> 0] & 1)) {
      z = (n + 1) | 0;
      h = z;
      u = (n + 8) | 0;
    } else {
      z = (n + 8) | 0;
      h = (n + 1) | 0;
      u = z;
      z = c[z >> 2] | 0;
    }
    c[r >> 2] = z;
    c[p >> 2] = s;
    c[q >> 2] = 0;
    f = (n + 4) | 0;
    w = a[w >> 0] | 0;
    a: while (1) {
      if (v) {
        if ((c[(v + 12) >> 2] | 0) == (c[(v + 16) >> 2] | 0)) {
          C = (md[c[((c[v >> 2] | 0) + 36) >> 2] & 127](v) | 0) == -1;
          v = C ? 0 : v;
        }
      } else v = 0;
      x = (v | 0) == 0;
      do
        if (y) {
          if ((c[(y + 12) >> 2] | 0) != (c[(y + 16) >> 2] | 0))
            if (x) break;
            else break a;
          if ((md[c[((c[y >> 2] | 0) + 36) >> 2] & 127](y) | 0) != -1) {
            if (!x) break a;
          } else l = 19;
        } else l = 19;
      while (0);
      if ((l | 0) == 19) {
        l = 0;
        if (x) {
          y = 0;
          break;
        } else y = 0;
      }
      C = a[n >> 0] | 0;
      B = (C & 1) == 0;
      if (B) A = (C & 255) >>> 1;
      else A = c[f >> 2] | 0;
      if ((c[r >> 2] | 0) == ((z + A) | 0)) {
        if (B) A = (C & 255) >>> 1;
        else A = c[f >> 2] | 0;
        Ki(n, A << 1);
        if (!(a[n >> 0] & 1)) z = 10;
        else z = ((c[n >> 2] & -2) + -1) | 0;
        Ki(n, z);
        if (!(a[n >> 0] & 1)) z = h;
        else z = c[u >> 2] | 0;
        c[r >> 2] = z + A;
      }
      A = (v + 12) | 0;
      C = c[A >> 2] | 0;
      B = (v + 16) | 0;
      if ((C | 0) == (c[B >> 2] | 0)) C = md[c[((c[v >> 2] | 0) + 36) >> 2] & 127](v) | 0;
      else C = d[C >> 0] | 0;
      if (Bk(C & 255, g, z, r, q, w, e, s, p, t) | 0) break;
      x = c[A >> 2] | 0;
      if ((x | 0) == (c[B >> 2] | 0)) {
        md[c[((c[v >> 2] | 0) + 40) >> 2] & 127](v) | 0;
        continue;
      } else {
        c[A >> 2] = x + 1;
        continue;
      }
    }
    t = a[e >> 0] | 0;
    if (!(t & 1)) t = (t & 255) >>> 1;
    else t = c[(e + 4) >> 2] | 0;
    if ((t | 0) != 0 ? ((o = c[p >> 2] | 0), ((o - s) | 0) < 160) : 0) {
      C = c[q >> 2] | 0;
      c[p >> 2] = o + 4;
      c[o >> 2] = C;
    }
    B = Dp(z, c[r >> 2] | 0, j, g) | 0;
    C = k;
    c[C >> 2] = B;
    c[(C + 4) >> 2] = H;
    hn(e, s, c[p >> 2] | 0, j);
    if (!x) {
      if ((c[(v + 12) >> 2] | 0) == (c[(v + 16) >> 2] | 0)) {
        C = (md[c[((c[v >> 2] | 0) + 36) >> 2] & 127](v) | 0) == -1;
        v = C ? 0 : v;
      }
    } else v = 0;
    k = (v | 0) == 0;
    do
      if (y) {
        if ((c[(y + 12) >> 2] | 0) != (c[(y + 16) >> 2] | 0))
          if (k) break;
          else {
            l = 60;
            break;
          }
        if ((md[c[((c[y >> 2] | 0) + 36) >> 2] & 127](y) | 0) != -1) {
          if (!k) l = 60;
        } else l = 58;
      } else l = 58;
    while (0);
    if ((l | 0) == 58 ? k : 0) l = 60;
    if ((l | 0) == 60) c[j >> 2] = c[j >> 2] | 2;
    c[b >> 2] = v;
    if (a[n >> 0] & 1) Uq(c[(n + 8) >> 2] | 0);
    if (!(a[e >> 0] & 1)) {
      i = m;
      return;
    }
    Uq(c[(e + 8) >> 2] | 0);
    i = m;
    return;
  }
  function xk(b, e, f, h, j, k, l) {
    b = b | 0;
    e = e | 0;
    f = f | 0;
    h = h | 0;
    j = j | 0;
    k = k | 0;
    l = l | 0;
    var m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0,
      y = 0,
      z = 0,
      A = 0,
      B = 0,
      C = 0,
      D = 0,
      E = 0,
      F = 0;
    o = i;
    i = (i + 256) | 0;
    v = (o + 208) | 0;
    x = (o + 200) | 0;
    y = (o + 240) | 0;
    e = o;
    n = (o + 188) | 0;
    s = (o + 184) | 0;
    u = (o + 16) | 0;
    q = (o + 176) | 0;
    r = (o + 180) | 0;
    t = (o + 241) | 0;
    w = (o + 242) | 0;
    z = c[f >> 2] | 0;
    B = c[h >> 2] | 0;
    Uk(e, j, v, x, y);
    c[(n + 0) >> 2] = 0;
    c[(n + 4) >> 2] = 0;
    c[(n + 8) >> 2] = 0;
    Ki(n, 10);
    if (!(a[n >> 0] & 1)) {
      C = (n + 1) | 0;
      h = C;
      j = (n + 8) | 0;
    } else {
      C = (n + 8) | 0;
      h = (n + 1) | 0;
      j = C;
      C = c[C >> 2] | 0;
    }
    c[s >> 2] = C;
    c[q >> 2] = u;
    c[r >> 2] = 0;
    a[t >> 0] = 1;
    a[w >> 0] = 69;
    f = (n + 4) | 0;
    x = a[x >> 0] | 0;
    y = a[y >> 0] | 0;
    a: while (1) {
      if (z) {
        if ((c[(z + 12) >> 2] | 0) == (c[(z + 16) >> 2] | 0)) {
          F = (md[c[((c[z >> 2] | 0) + 36) >> 2] & 127](z) | 0) == -1;
          z = F ? 0 : z;
        }
      } else z = 0;
      A = (z | 0) == 0;
      do
        if (B) {
          if ((c[(B + 12) >> 2] | 0) != (c[(B + 16) >> 2] | 0))
            if (A) break;
            else break a;
          if ((md[c[((c[B >> 2] | 0) + 36) >> 2] & 127](B) | 0) != -1) {
            if (!A) break a;
          } else m = 15;
        } else m = 15;
      while (0);
      if ((m | 0) == 15) {
        m = 0;
        if (A) {
          B = 0;
          break;
        } else B = 0;
      }
      E = a[n >> 0] | 0;
      F = (E & 1) == 0;
      if (F) D = (E & 255) >>> 1;
      else D = c[f >> 2] | 0;
      if ((c[s >> 2] | 0) == ((C + D) | 0)) {
        if (F) D = (E & 255) >>> 1;
        else D = c[f >> 2] | 0;
        Ki(n, D << 1);
        if (!(a[n >> 0] & 1)) C = 10;
        else C = ((c[n >> 2] & -2) + -1) | 0;
        Ki(n, C);
        if (!(a[n >> 0] & 1)) C = h;
        else C = c[j >> 2] | 0;
        c[s >> 2] = C + D;
      }
      E = (z + 12) | 0;
      F = c[E >> 2] | 0;
      D = (z + 16) | 0;
      if ((F | 0) == (c[D >> 2] | 0)) F = md[c[((c[z >> 2] | 0) + 36) >> 2] & 127](z) | 0;
      else F = d[F >> 0] | 0;
      if (Vk(F & 255, t, w, C, s, x, y, e, u, q, r, v) | 0) break;
      A = c[E >> 2] | 0;
      if ((A | 0) == (c[D >> 2] | 0)) {
        md[c[((c[z >> 2] | 0) + 40) >> 2] & 127](z) | 0;
        continue;
      } else {
        c[E >> 2] = A + 1;
        continue;
      }
    }
    v = a[e >> 0] | 0;
    if (!(v & 1)) v = (v & 255) >>> 1;
    else v = c[(e + 4) >> 2] | 0;
    if (
      ((v | 0) != 0 ? (a[t >> 0] | 0) != 0 : 0) ? ((p = c[q >> 2] | 0), ((p - u) | 0) < 160) : 0
    ) {
      F = c[r >> 2] | 0;
      c[q >> 2] = p + 4;
      c[p >> 2] = F;
    }
    g[l >> 2] = +Cp(C, c[s >> 2] | 0, k);
    hn(e, u, c[q >> 2] | 0, k);
    if (!A) {
      if ((c[(z + 12) >> 2] | 0) == (c[(z + 16) >> 2] | 0)) {
        F = (md[c[((c[z >> 2] | 0) + 36) >> 2] & 127](z) | 0) == -1;
        z = F ? 0 : z;
      }
    } else z = 0;
    p = (z | 0) == 0;
    do
      if (B) {
        if ((c[(B + 12) >> 2] | 0) != (c[(B + 16) >> 2] | 0))
          if (p) break;
          else {
            m = 57;
            break;
          }
        if ((md[c[((c[B >> 2] | 0) + 36) >> 2] & 127](B) | 0) != -1) {
          if (!p) m = 57;
        } else m = 55;
      } else m = 55;
    while (0);
    if ((m | 0) == 55 ? p : 0) m = 57;
    if ((m | 0) == 57) c[k >> 2] = c[k >> 2] | 2;
    c[b >> 2] = z;
    if (a[n >> 0] & 1) Uq(c[(n + 8) >> 2] | 0);
    if (!(a[e >> 0] & 1)) {
      i = o;
      return;
    }
    Uq(c[(e + 8) >> 2] | 0);
    i = o;
    return;
  }
  function yk(b, e, f, g, j, k, l) {
    b = b | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    j = j | 0;
    k = k | 0;
    l = l | 0;
    var m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0,
      y = 0,
      z = 0,
      A = 0,
      B = 0,
      C = 0,
      D = 0,
      E = 0,
      F = 0;
    o = i;
    i = (i + 256) | 0;
    v = (o + 208) | 0;
    x = (o + 200) | 0;
    y = (o + 240) | 0;
    e = o;
    n = (o + 188) | 0;
    s = (o + 184) | 0;
    u = (o + 16) | 0;
    q = (o + 176) | 0;
    r = (o + 180) | 0;
    t = (o + 241) | 0;
    w = (o + 242) | 0;
    z = c[f >> 2] | 0;
    B = c[g >> 2] | 0;
    Uk(e, j, v, x, y);
    c[(n + 0) >> 2] = 0;
    c[(n + 4) >> 2] = 0;
    c[(n + 8) >> 2] = 0;
    Ki(n, 10);
    if (!(a[n >> 0] & 1)) {
      C = (n + 1) | 0;
      g = C;
      j = (n + 8) | 0;
    } else {
      C = (n + 8) | 0;
      g = (n + 1) | 0;
      j = C;
      C = c[C >> 2] | 0;
    }
    c[s >> 2] = C;
    c[q >> 2] = u;
    c[r >> 2] = 0;
    a[t >> 0] = 1;
    a[w >> 0] = 69;
    f = (n + 4) | 0;
    x = a[x >> 0] | 0;
    y = a[y >> 0] | 0;
    a: while (1) {
      if (z) {
        if ((c[(z + 12) >> 2] | 0) == (c[(z + 16) >> 2] | 0)) {
          F = (md[c[((c[z >> 2] | 0) + 36) >> 2] & 127](z) | 0) == -1;
          z = F ? 0 : z;
        }
      } else z = 0;
      A = (z | 0) == 0;
      do
        if (B) {
          if ((c[(B + 12) >> 2] | 0) != (c[(B + 16) >> 2] | 0))
            if (A) break;
            else break a;
          if ((md[c[((c[B >> 2] | 0) + 36) >> 2] & 127](B) | 0) != -1) {
            if (!A) break a;
          } else m = 15;
        } else m = 15;
      while (0);
      if ((m | 0) == 15) {
        m = 0;
        if (A) {
          B = 0;
          break;
        } else B = 0;
      }
      E = a[n >> 0] | 0;
      F = (E & 1) == 0;
      if (F) D = (E & 255) >>> 1;
      else D = c[f >> 2] | 0;
      if ((c[s >> 2] | 0) == ((C + D) | 0)) {
        if (F) D = (E & 255) >>> 1;
        else D = c[f >> 2] | 0;
        Ki(n, D << 1);
        if (!(a[n >> 0] & 1)) C = 10;
        else C = ((c[n >> 2] & -2) + -1) | 0;
        Ki(n, C);
        if (!(a[n >> 0] & 1)) C = g;
        else C = c[j >> 2] | 0;
        c[s >> 2] = C + D;
      }
      E = (z + 12) | 0;
      F = c[E >> 2] | 0;
      D = (z + 16) | 0;
      if ((F | 0) == (c[D >> 2] | 0)) F = md[c[((c[z >> 2] | 0) + 36) >> 2] & 127](z) | 0;
      else F = d[F >> 0] | 0;
      if (Vk(F & 255, t, w, C, s, x, y, e, u, q, r, v) | 0) break;
      A = c[E >> 2] | 0;
      if ((A | 0) == (c[D >> 2] | 0)) {
        md[c[((c[z >> 2] | 0) + 40) >> 2] & 127](z) | 0;
        continue;
      } else {
        c[E >> 2] = A + 1;
        continue;
      }
    }
    v = a[e >> 0] | 0;
    if (!(v & 1)) v = (v & 255) >>> 1;
    else v = c[(e + 4) >> 2] | 0;
    if (
      ((v | 0) != 0 ? (a[t >> 0] | 0) != 0 : 0) ? ((p = c[q >> 2] | 0), ((p - u) | 0) < 160) : 0
    ) {
      F = c[r >> 2] | 0;
      c[q >> 2] = p + 4;
      c[p >> 2] = F;
    }
    h[l >> 3] = +Bp(C, c[s >> 2] | 0, k);
    hn(e, u, c[q >> 2] | 0, k);
    if (!A) {
      if ((c[(z + 12) >> 2] | 0) == (c[(z + 16) >> 2] | 0)) {
        F = (md[c[((c[z >> 2] | 0) + 36) >> 2] & 127](z) | 0) == -1;
        z = F ? 0 : z;
      }
    } else z = 0;
    p = (z | 0) == 0;
    do
      if (B) {
        if ((c[(B + 12) >> 2] | 0) != (c[(B + 16) >> 2] | 0))
          if (p) break;
          else {
            m = 57;
            break;
          }
        if ((md[c[((c[B >> 2] | 0) + 36) >> 2] & 127](B) | 0) != -1) {
          if (!p) m = 57;
        } else m = 55;
      } else m = 55;
    while (0);
    if ((m | 0) == 55 ? p : 0) m = 57;
    if ((m | 0) == 57) c[k >> 2] = c[k >> 2] | 2;
    c[b >> 2] = z;
    if (a[n >> 0] & 1) Uq(c[(n + 8) >> 2] | 0);
    if (!(a[e >> 0] & 1)) {
      i = o;
      return;
    }
    Uq(c[(e + 8) >> 2] | 0);
    i = o;
    return;
  }
  function zk(b, e, f, g, j, k, l) {
    b = b | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    j = j | 0;
    k = k | 0;
    l = l | 0;
    var m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0,
      y = 0,
      z = 0,
      A = 0,
      B = 0,
      C = 0,
      D = 0,
      E = 0,
      F = 0;
    o = i;
    i = (i + 256) | 0;
    v = (o + 208) | 0;
    x = (o + 200) | 0;
    y = (o + 240) | 0;
    e = o;
    n = (o + 188) | 0;
    s = (o + 184) | 0;
    u = (o + 16) | 0;
    q = (o + 176) | 0;
    r = (o + 180) | 0;
    t = (o + 241) | 0;
    w = (o + 242) | 0;
    z = c[f >> 2] | 0;
    B = c[g >> 2] | 0;
    Uk(e, j, v, x, y);
    c[(n + 0) >> 2] = 0;
    c[(n + 4) >> 2] = 0;
    c[(n + 8) >> 2] = 0;
    Ki(n, 10);
    if (!(a[n >> 0] & 1)) {
      C = (n + 1) | 0;
      g = C;
      j = (n + 8) | 0;
    } else {
      C = (n + 8) | 0;
      g = (n + 1) | 0;
      j = C;
      C = c[C >> 2] | 0;
    }
    c[s >> 2] = C;
    c[q >> 2] = u;
    c[r >> 2] = 0;
    a[t >> 0] = 1;
    a[w >> 0] = 69;
    f = (n + 4) | 0;
    x = a[x >> 0] | 0;
    y = a[y >> 0] | 0;
    a: while (1) {
      if (z) {
        if ((c[(z + 12) >> 2] | 0) == (c[(z + 16) >> 2] | 0)) {
          F = (md[c[((c[z >> 2] | 0) + 36) >> 2] & 127](z) | 0) == -1;
          z = F ? 0 : z;
        }
      } else z = 0;
      A = (z | 0) == 0;
      do
        if (B) {
          if ((c[(B + 12) >> 2] | 0) != (c[(B + 16) >> 2] | 0))
            if (A) break;
            else break a;
          if ((md[c[((c[B >> 2] | 0) + 36) >> 2] & 127](B) | 0) != -1) {
            if (!A) break a;
          } else m = 15;
        } else m = 15;
      while (0);
      if ((m | 0) == 15) {
        m = 0;
        if (A) {
          B = 0;
          break;
        } else B = 0;
      }
      E = a[n >> 0] | 0;
      F = (E & 1) == 0;
      if (F) D = (E & 255) >>> 1;
      else D = c[f >> 2] | 0;
      if ((c[s >> 2] | 0) == ((C + D) | 0)) {
        if (F) D = (E & 255) >>> 1;
        else D = c[f >> 2] | 0;
        Ki(n, D << 1);
        if (!(a[n >> 0] & 1)) C = 10;
        else C = ((c[n >> 2] & -2) + -1) | 0;
        Ki(n, C);
        if (!(a[n >> 0] & 1)) C = g;
        else C = c[j >> 2] | 0;
        c[s >> 2] = C + D;
      }
      E = (z + 12) | 0;
      F = c[E >> 2] | 0;
      D = (z + 16) | 0;
      if ((F | 0) == (c[D >> 2] | 0)) F = md[c[((c[z >> 2] | 0) + 36) >> 2] & 127](z) | 0;
      else F = d[F >> 0] | 0;
      if (Vk(F & 255, t, w, C, s, x, y, e, u, q, r, v) | 0) break;
      A = c[E >> 2] | 0;
      if ((A | 0) == (c[D >> 2] | 0)) {
        md[c[((c[z >> 2] | 0) + 40) >> 2] & 127](z) | 0;
        continue;
      } else {
        c[E >> 2] = A + 1;
        continue;
      }
    }
    v = a[e >> 0] | 0;
    if (!(v & 1)) v = (v & 255) >>> 1;
    else v = c[(e + 4) >> 2] | 0;
    if (
      ((v | 0) != 0 ? (a[t >> 0] | 0) != 0 : 0) ? ((p = c[q >> 2] | 0), ((p - u) | 0) < 160) : 0
    ) {
      F = c[r >> 2] | 0;
      c[q >> 2] = p + 4;
      c[p >> 2] = F;
    }
    h[l >> 3] = +Ap(C, c[s >> 2] | 0, k);
    hn(e, u, c[q >> 2] | 0, k);
    if (!A) {
      if ((c[(z + 12) >> 2] | 0) == (c[(z + 16) >> 2] | 0)) {
        F = (md[c[((c[z >> 2] | 0) + 36) >> 2] & 127](z) | 0) == -1;
        z = F ? 0 : z;
      }
    } else z = 0;
    p = (z | 0) == 0;
    do
      if (B) {
        if ((c[(B + 12) >> 2] | 0) != (c[(B + 16) >> 2] | 0))
          if (p) break;
          else {
            m = 57;
            break;
          }
        if ((md[c[((c[B >> 2] | 0) + 36) >> 2] & 127](B) | 0) != -1) {
          if (!p) m = 57;
        } else m = 55;
      } else m = 55;
    while (0);
    if ((m | 0) == 55 ? p : 0) m = 57;
    if ((m | 0) == 57) c[k >> 2] = c[k >> 2] | 2;
    c[b >> 2] = z;
    if (a[n >> 0] & 1) Uq(c[(n + 8) >> 2] | 0);
    if (!(a[e >> 0] & 1)) {
      i = o;
      return;
    }
    Uq(c[(e + 8) >> 2] | 0);
    i = o;
    return;
  }
  function Ak(b, e, f, g, h, j, k) {
    b = b | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    k = k | 0;
    var l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0,
      y = 0,
      z = 0,
      A = 0,
      B = 0,
      C = 0;
    n = i;
    i = (i + 240) | 0;
    o = n;
    s = (n + 204) | 0;
    e = (n + 184) | 0;
    m = (n + 172) | 0;
    p = (n + 168) | 0;
    r = (n + 8) | 0;
    t = (n + 196) | 0;
    q = (n + 200) | 0;
    c[(e + 0) >> 2] = 0;
    c[(e + 4) >> 2] = 0;
    c[(e + 8) >> 2] = 0;
    h = c[(h + 28) >> 2] | 0;
    B = (h + 4) | 0;
    c[B >> 2] = (c[B >> 2] | 0) + 1;
    B = Sn(h, 19072) | 0;
    sd[c[((c[B >> 2] | 0) + 32) >> 2] & 7](B, 17600, 17626 | 0, s) | 0;
    B = (h + 4) | 0;
    C = c[B >> 2] | 0;
    c[B >> 2] = C + -1;
    if (!C) jd[c[((c[h >> 2] | 0) + 8) >> 2] & 255](h);
    c[(m + 0) >> 2] = 0;
    c[(m + 4) >> 2] = 0;
    c[(m + 8) >> 2] = 0;
    Ki(m, 10);
    if (!(a[m >> 0] & 1)) {
      z = (m + 1) | 0;
      u = z;
      h = (m + 8) | 0;
    } else {
      z = (m + 8) | 0;
      u = (m + 1) | 0;
      h = z;
      z = c[z >> 2] | 0;
    }
    c[p >> 2] = z;
    c[t >> 2] = r;
    c[q >> 2] = 0;
    x = (m + 4) | 0;
    v = c[f >> 2] | 0;
    a: while (1) {
      if (v) {
        if (
          (c[(v + 12) >> 2] | 0) == (c[(v + 16) >> 2] | 0)
            ? (md[c[((c[v >> 2] | 0) + 36) >> 2] & 127](v) | 0) == -1
            : 0
        ) {
          c[f >> 2] = 0;
          v = 0;
        }
      } else v = 0;
      w = (v | 0) == 0;
      y = c[g >> 2] | 0;
      do
        if (y) {
          if ((c[(y + 12) >> 2] | 0) != (c[(y + 16) >> 2] | 0))
            if (w) break;
            else break a;
          if ((md[c[((c[y >> 2] | 0) + 36) >> 2] & 127](y) | 0) != -1)
            if (w) break;
            else break a;
          else {
            c[g >> 2] = 0;
            l = 21;
            break;
          }
        } else l = 21;
      while (0);
      if ((l | 0) == 21) {
        l = 0;
        if (w) {
          y = 0;
          break;
        } else y = 0;
      }
      C = a[m >> 0] | 0;
      B = (C & 1) == 0;
      if (B) A = (C & 255) >>> 1;
      else A = c[x >> 2] | 0;
      if ((c[p >> 2] | 0) == ((z + A) | 0)) {
        if (B) A = (C & 255) >>> 1;
        else A = c[x >> 2] | 0;
        Ki(m, A << 1);
        if (!(a[m >> 0] & 1)) z = 10;
        else z = ((c[m >> 2] & -2) + -1) | 0;
        Ki(m, z);
        if (!(a[m >> 0] & 1)) z = u;
        else z = c[h >> 2] | 0;
        c[p >> 2] = z + A;
      }
      A = (v + 12) | 0;
      C = c[A >> 2] | 0;
      B = (v + 16) | 0;
      if ((C | 0) == (c[B >> 2] | 0)) C = md[c[((c[v >> 2] | 0) + 36) >> 2] & 127](v) | 0;
      else C = d[C >> 0] | 0;
      if (Bk(C & 255, 16, z, p, q, 0, e, r, t, s) | 0) break;
      w = c[A >> 2] | 0;
      if ((w | 0) == (c[B >> 2] | 0)) {
        md[c[((c[v >> 2] | 0) + 40) >> 2] & 127](v) | 0;
        continue;
      } else {
        c[A >> 2] = w + 1;
        continue;
      }
    }
    Ki(m, ((c[p >> 2] | 0) - z) | 0);
    if (a[m >> 0] & 1) u = c[h >> 2] | 0;
    C = Dk() | 0;
    c[o >> 2] = k;
    if ((Ck(u, C, o) | 0) != 1) c[j >> 2] = 4;
    if (!w) {
      if (
        (c[(v + 12) >> 2] | 0) == (c[(v + 16) >> 2] | 0)
          ? (md[c[((c[v >> 2] | 0) + 36) >> 2] & 127](v) | 0) == -1
          : 0
      ) {
        c[f >> 2] = 0;
        v = 0;
      }
    } else v = 0;
    k = (v | 0) == 0;
    do
      if (y) {
        if ((c[(y + 12) >> 2] | 0) != (c[(y + 16) >> 2] | 0))
          if (k) break;
          else {
            l = 64;
            break;
          }
        if ((md[c[((c[y >> 2] | 0) + 36) >> 2] & 127](y) | 0) != -1)
          if (k) break;
          else {
            l = 64;
            break;
          }
        else {
          c[g >> 2] = 0;
          l = 62;
          break;
        }
      } else l = 62;
    while (0);
    if ((l | 0) == 62 ? k : 0) l = 64;
    if ((l | 0) == 64) c[j >> 2] = c[j >> 2] | 2;
    c[b >> 2] = v;
    if (a[m >> 0] & 1) Uq(c[(m + 8) >> 2] | 0);
    if (!(a[e >> 0] & 1)) {
      i = n;
      return;
    }
    Uq(c[(e + 8) >> 2] | 0);
    i = n;
    return;
  }
  function Bk(b, d, e, f, g, h, j, k, l, m) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    k = k | 0;
    l = l | 0;
    m = m | 0;
    var n = 0,
      o = 0,
      p = 0,
      q = 0;
    n = i;
    p = c[f >> 2] | 0;
    o = (p | 0) == (e | 0);
    do
      if (o) {
        q = (a[(m + 24) >> 0] | 0) == (b << 24) >> 24;
        if (!q ? (a[(m + 25) >> 0] | 0) != (b << 24) >> 24 : 0) break;
        c[f >> 2] = e + 1;
        a[e >> 0] = q ? 43 : 45;
        c[g >> 2] = 0;
        q = 0;
        i = n;
        return q | 0;
      }
    while (0);
    q = a[j >> 0] | 0;
    if (!(q & 1)) j = (q & 255) >>> 1;
    else j = c[(j + 4) >> 2] | 0;
    if ((j | 0) != 0 ? (b << 24) >> 24 == (h << 24) >> 24 : 0) {
      o = c[l >> 2] | 0;
      if (((o - k) | 0) >= 160) {
        q = 0;
        i = n;
        return q | 0;
      }
      q = c[g >> 2] | 0;
      c[l >> 2] = o + 4;
      c[o >> 2] = q;
      c[g >> 2] = 0;
      q = 0;
      i = n;
      return q | 0;
    }
    l = (m + 26) | 0;
    k = m;
    while (1) {
      if ((a[k >> 0] | 0) == (b << 24) >> 24) break;
      k = (k + 1) | 0;
      if ((k | 0) == (l | 0)) {
        k = l;
        break;
      }
    }
    m = (k - m) | 0;
    if ((m | 0) > 23) {
      q = -1;
      i = n;
      return q | 0;
    }
    if ((d | 0) == 16) {
      if ((m | 0) >= 22) {
        if (o) {
          q = -1;
          i = n;
          return q | 0;
        }
        if (((p - e) | 0) >= 3) {
          q = -1;
          i = n;
          return q | 0;
        }
        if ((a[(p + -1) >> 0] | 0) != 48) {
          q = -1;
          i = n;
          return q | 0;
        }
        c[g >> 2] = 0;
        q = a[(17600 + m) >> 0] | 0;
        c[f >> 2] = p + 1;
        a[p >> 0] = q;
        q = 0;
        i = n;
        return q | 0;
      }
    } else if (((d | 0) == 10) | ((d | 0) == 8) ? (m | 0) >= (d | 0) : 0) {
      q = -1;
      i = n;
      return q | 0;
    }
    q = a[(17600 + m) >> 0] | 0;
    c[f >> 2] = p + 1;
    a[p >> 0] = q;
    c[g >> 2] = (c[g >> 2] | 0) + 1;
    q = 0;
    i = n;
    return q | 0;
  }
  function Ck(a, b, d) {
    a = a | 0;
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0;
    e = i;
    i = (i + 16) | 0;
    f = e;
    c[f >> 2] = d;
    b = Yb(b | 0) | 0;
    a = Vp(a, 17640, f) | 0;
    if (!b) {
      i = e;
      return a | 0;
    }
    Yb(b | 0) | 0;
    i = e;
    return a | 0;
  }
  function Dk() {
    var b = 0;
    b = i;
    if ((a[18984] | 0) == 0 ? (Fa(18984) | 0) != 0 : 0) {
      c[4744] = rb(2147483647, 18992, 0) | 0;
      Vc(18984);
    }
    i = b;
    return c[4744] | 0;
  }
  function Ek(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function Fk(a) {
    a = a | 0;
    return;
  }
  function Gk(b, d, e, f, g, h, j) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    var k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0;
    k = i;
    i = (i + 64) | 0;
    o = (k + 8) | 0;
    p = (k + 40) | 0;
    m = (k + 44) | 0;
    n = (k + 48) | 0;
    r = (k + 4) | 0;
    q = k;
    l = (k + 16) | 0;
    if (!(c[(g + 4) >> 2] & 1)) {
      c[m >> 2] = -1;
      l = c[((c[d >> 2] | 0) + 16) >> 2] | 0;
      c[r >> 2] = c[e >> 2];
      c[q >> 2] = c[f >> 2];
      c[(p + 0) >> 2] = c[(r + 0) >> 2];
      c[(o + 0) >> 2] = c[(q + 0) >> 2];
      gd[l & 63](n, d, p, o, g, h, m);
      l = c[n >> 2] | 0;
      c[e >> 2] = l;
      e = c[m >> 2] | 0;
      if ((e | 0) == 1) a[j >> 0] = 1;
      else if (!e) a[j >> 0] = 0;
      else {
        a[j >> 0] = 1;
        c[h >> 2] = 4;
      }
      c[b >> 2] = l;
      i = k;
      return;
    }
    d = (g + 28) | 0;
    n = c[d >> 2] | 0;
    m = (n + 4) | 0;
    c[m >> 2] = (c[m >> 2] | 0) + 1;
    m = Sn(n, 19064) | 0;
    r = (n + 4) | 0;
    g = c[r >> 2] | 0;
    c[r >> 2] = g + -1;
    if (!g) jd[c[((c[n >> 2] | 0) + 8) >> 2] & 255](n);
    n = c[d >> 2] | 0;
    d = (n + 4) | 0;
    c[d >> 2] = (c[d >> 2] | 0) + 1;
    d = Sn(n, 19224) | 0;
    r = (n + 4) | 0;
    g = c[r >> 2] | 0;
    c[r >> 2] = g + -1;
    if (!g) jd[c[((c[n >> 2] | 0) + 8) >> 2] & 255](n);
    kd[c[((c[d >> 2] | 0) + 24) >> 2] & 63](l, d);
    g = (l + 12) | 0;
    kd[c[((c[d >> 2] | 0) + 28) >> 2] & 63](g, d);
    a[j >> 0] = ((Hk(e, c[f >> 2] | 0, l, (l + 24) | 0, m, h, 1) | 0) == (l | 0)) & 1;
    c[b >> 2] = c[e >> 2];
    if (a[g >> 0] & 1) Uq(c[(l + 20) >> 2] | 0);
    if (!(a[l >> 0] & 1)) {
      i = k;
      return;
    }
    Uq(c[(l + 8) >> 2] | 0);
    i = k;
    return;
  }
  function Hk(b, d, e, f, g, h, j) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    var k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0;
    m = i;
    i = (i + 112) | 0;
    n = m;
    s = (((f - e) | 0) / 12) | 0;
    if (s >>> 0 > 100) {
      n = Tq(s) | 0;
      if (!n) {
        x = Wb(4) | 0;
        c[x >> 2] = 27280;
        Zc(x | 0, 27328, 220);
      } else l = n;
    } else l = 0;
    o = (e | 0) == (f | 0);
    if (o) r = 0;
    else {
      p = e;
      r = 0;
      q = n;
      while (1) {
        t = a[p >> 0] | 0;
        if (!(t & 1)) t = (t & 255) >>> 1;
        else t = c[(p + 4) >> 2] | 0;
        if (!t) {
          a[q >> 0] = 2;
          r = (r + 1) | 0;
          s = (s + -1) | 0;
        } else a[q >> 0] = 1;
        p = (p + 12) | 0;
        if ((p | 0) == (f | 0)) break;
        else q = (q + 1) | 0;
      }
    }
    p = 0;
    a: while (1) {
      t = (s | 0) != 0;
      q = p;
      while (1) {
        p = c[b >> 2] | 0;
        do
          if (p) {
            u = c[(p + 12) >> 2] | 0;
            if ((u | 0) == (c[(p + 16) >> 2] | 0))
              p = md[c[((c[p >> 2] | 0) + 36) >> 2] & 127](p) | 0;
            else p = c[u >> 2] | 0;
            if ((p | 0) == -1) {
              c[b >> 2] = 0;
              u = 1;
              break;
            } else {
              u = (c[b >> 2] | 0) == 0;
              break;
            }
          } else u = 1;
        while (0);
        if (!d) {
          p = 0;
          w = 1;
          d = 0;
        } else {
          p = c[(d + 12) >> 2] | 0;
          if ((p | 0) == (c[(d + 16) >> 2] | 0))
            p = md[c[((c[d >> 2] | 0) + 36) >> 2] & 127](d) | 0;
          else p = c[p >> 2] | 0;
          x = (p | 0) == -1;
          p = x ? 0 : d;
          w = x ? 1 : 0;
          d = x ? 0 : d;
        }
        v = c[b >> 2] | 0;
        if (!((u ^ w) & t)) break a;
        p = c[(v + 12) >> 2] | 0;
        if ((p | 0) == (c[(v + 16) >> 2] | 0)) u = md[c[((c[v >> 2] | 0) + 36) >> 2] & 127](v) | 0;
        else u = c[p >> 2] | 0;
        if (!j) u = vd[c[((c[g >> 2] | 0) + 28) >> 2] & 63](g, u) | 0;
        p = (q + 1) | 0;
        if (o) q = p;
        else {
          w = 0;
          t = e;
          v = n;
          break;
        }
      }
      while (1) {
        do
          if ((a[v >> 0] | 0) == 1) {
            if (!(a[t >> 0] & 1)) x = (t + 4) | 0;
            else x = c[(t + 8) >> 2] | 0;
            x = c[(x + (q << 2)) >> 2] | 0;
            if (!j) x = vd[c[((c[g >> 2] | 0) + 28) >> 2] & 63](g, x) | 0;
            if ((u | 0) != (x | 0)) {
              a[v >> 0] = 0;
              s = (s + -1) | 0;
              break;
            }
            w = a[t >> 0] | 0;
            if (!(w & 1)) w = (w & 255) >>> 1;
            else w = c[(t + 4) >> 2] | 0;
            if ((w | 0) == (p | 0)) {
              a[v >> 0] = 2;
              w = 1;
              r = (r + 1) | 0;
              s = (s + -1) | 0;
            } else w = 1;
          }
        while (0);
        t = (t + 12) | 0;
        if ((t | 0) == (f | 0)) break;
        v = (v + 1) | 0;
      }
      if (!w) continue;
      u = c[b >> 2] | 0;
      q = (u + 12) | 0;
      t = c[q >> 2] | 0;
      if ((t | 0) == (c[(u + 16) >> 2] | 0)) md[c[((c[u >> 2] | 0) + 40) >> 2] & 127](u) | 0;
      else c[q >> 2] = t + 4;
      if (((r + s) | 0) >>> 0 < 2) continue;
      else {
        q = e;
        t = n;
      }
      while (1) {
        if ((a[t >> 0] | 0) == 2) {
          u = a[q >> 0] | 0;
          if (!(u & 1)) u = (u & 255) >>> 1;
          else u = c[(q + 4) >> 2] | 0;
          if ((u | 0) != (p | 0)) {
            a[t >> 0] = 0;
            r = (r + -1) | 0;
          }
        }
        q = (q + 12) | 0;
        if ((q | 0) == (f | 0)) continue a;
        else t = (t + 1) | 0;
      }
    }
    do
      if (v) {
        j = c[(v + 12) >> 2] | 0;
        if ((j | 0) == (c[(v + 16) >> 2] | 0)) j = md[c[((c[v >> 2] | 0) + 36) >> 2] & 127](v) | 0;
        else j = c[j >> 2] | 0;
        if ((j | 0) == -1) {
          c[b >> 2] = 0;
          b = 1;
          break;
        } else {
          b = (c[b >> 2] | 0) == 0;
          break;
        }
      } else b = 1;
    while (0);
    if (p) {
      j = c[(p + 12) >> 2] | 0;
      if ((j | 0) == (c[(p + 16) >> 2] | 0)) j = md[c[((c[p >> 2] | 0) + 36) >> 2] & 127](p) | 0;
      else j = c[j >> 2] | 0;
      if ((j | 0) != -1) {
        if (!b) k = 75;
      } else k = 73;
    } else k = 73;
    if ((k | 0) == 73 ? b : 0) k = 75;
    if ((k | 0) == 75) c[h >> 2] = c[h >> 2] | 2;
    b: do
      if (!o)
        if ((a[n >> 0] | 0) == 2) f = e;
        else
          while (1) {
            e = (e + 12) | 0;
            n = (n + 1) | 0;
            if ((e | 0) == (f | 0)) {
              k = 80;
              break b;
            }
            if ((a[n >> 0] | 0) == 2) {
              f = e;
              break;
            }
          }
      else k = 80;
    while (0);
    if ((k | 0) == 80) c[h >> 2] = c[h >> 2] | 4;
    if (!l) {
      i = m;
      return f | 0;
    }
    Uq(l);
    i = m;
    return f | 0;
  }
  function Ik(b, d, e, f, g, h, j) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    var k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0,
      y = 0,
      z = 0,
      A = 0;
    m = i;
    i = (i + 304) | 0;
    s = (m + 160) | 0;
    v = (m + 280) | 0;
    l = (m + 264) | 0;
    d = (m + 284) | 0;
    p = (m + 300) | 0;
    r = m;
    q = (m + 276) | 0;
    o = (m + 296) | 0;
    u = c[e >> 2] | 0;
    w = c[f >> 2] | 0;
    f = c[(g + 4) >> 2] & 74;
    if (!f) f = 0;
    else if ((f | 0) == 8) f = 16;
    else if ((f | 0) == 64) f = 8;
    else f = 10;
    Wk(l, g, s, v);
    c[(d + 0) >> 2] = 0;
    c[(d + 4) >> 2] = 0;
    c[(d + 8) >> 2] = 0;
    Ki(d, 10);
    if (!(a[d >> 0] & 1)) {
      x = (d + 1) | 0;
      e = x;
      t = (d + 8) | 0;
    } else {
      x = (d + 8) | 0;
      e = (d + 1) | 0;
      t = x;
      x = c[x >> 2] | 0;
    }
    c[p >> 2] = x;
    c[q >> 2] = r;
    c[o >> 2] = 0;
    g = (d + 4) | 0;
    v = c[v >> 2] | 0;
    while (1) {
      if (!u) {
        y = 1;
        u = 0;
      } else {
        y = c[(u + 12) >> 2] | 0;
        if ((y | 0) == (c[(u + 16) >> 2] | 0)) y = md[c[((c[u >> 2] | 0) + 36) >> 2] & 127](u) | 0;
        else y = c[y >> 2] | 0;
        A = (y | 0) == -1;
        y = A ? 1 : 0;
        u = A ? 0 : u;
      }
      if (w) {
        z = c[(w + 12) >> 2] | 0;
        if ((z | 0) == (c[(w + 16) >> 2] | 0)) z = md[c[((c[w >> 2] | 0) + 36) >> 2] & 127](w) | 0;
        else z = c[z >> 2] | 0;
        if ((z | 0) != -1) {
          if (!y) break;
        } else k = 20;
      } else k = 20;
      if ((k | 0) == 20) {
        k = 0;
        if (y) {
          w = 0;
          break;
        } else w = 0;
      }
      A = a[d >> 0] | 0;
      y = (A & 1) == 0;
      if (y) z = (A & 255) >>> 1;
      else z = c[g >> 2] | 0;
      if ((c[p >> 2] | 0) == ((x + z) | 0)) {
        if (y) y = (A & 255) >>> 1;
        else y = c[g >> 2] | 0;
        Ki(d, y << 1);
        if (!(a[d >> 0] & 1)) x = 10;
        else x = ((c[d >> 2] & -2) + -1) | 0;
        Ki(d, x);
        if (!(a[d >> 0] & 1)) x = e;
        else x = c[t >> 2] | 0;
        c[p >> 2] = x + y;
      }
      z = (u + 12) | 0;
      A = c[z >> 2] | 0;
      y = (u + 16) | 0;
      if ((A | 0) == (c[y >> 2] | 0)) A = md[c[((c[u >> 2] | 0) + 36) >> 2] & 127](u) | 0;
      else A = c[A >> 2] | 0;
      if (Sk(A, f, x, p, o, v, l, r, q, s) | 0) break;
      A = c[z >> 2] | 0;
      if ((A | 0) == (c[y >> 2] | 0)) {
        md[c[((c[u >> 2] | 0) + 40) >> 2] & 127](u) | 0;
        continue;
      } else {
        c[z >> 2] = A + 4;
        continue;
      }
    }
    s = a[l >> 0] | 0;
    if (!(s & 1)) s = (s & 255) >>> 1;
    else s = c[(l + 4) >> 2] | 0;
    if ((s | 0) != 0 ? ((n = c[q >> 2] | 0), ((n - r) | 0) < 160) : 0) {
      A = c[o >> 2] | 0;
      c[q >> 2] = n + 4;
      c[n >> 2] = A;
    }
    c[j >> 2] = Ip(x, c[p >> 2] | 0, h, f) | 0;
    hn(l, r, c[q >> 2] | 0, h);
    if (!u) {
      j = 0;
      n = 1;
    } else {
      j = c[(u + 12) >> 2] | 0;
      if ((j | 0) == (c[(u + 16) >> 2] | 0)) j = md[c[((c[u >> 2] | 0) + 36) >> 2] & 127](u) | 0;
      else j = c[j >> 2] | 0;
      n = (j | 0) == -1;
      j = n ? 0 : u;
      n = n ? 1 : 0;
    }
    if (w) {
      o = c[(w + 12) >> 2] | 0;
      if ((o | 0) == (c[(w + 16) >> 2] | 0)) o = md[c[((c[w >> 2] | 0) + 36) >> 2] & 127](w) | 0;
      else o = c[o >> 2] | 0;
      if ((o | 0) != -1) {
        if (!n) k = 62;
      } else k = 60;
    } else k = 60;
    if ((k | 0) == 60 ? n : 0) k = 62;
    if ((k | 0) == 62) c[h >> 2] = c[h >> 2] | 2;
    c[b >> 2] = j;
    if (a[d >> 0] & 1) Uq(c[(d + 8) >> 2] | 0);
    if (!(a[l >> 0] & 1)) {
      i = m;
      return;
    }
    Uq(c[(l + 8) >> 2] | 0);
    i = m;
    return;
  }
  function Jk(b, d, e, f, g, h, j) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    var k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0,
      y = 0,
      z = 0,
      A = 0;
    m = i;
    i = (i + 304) | 0;
    s = (m + 160) | 0;
    v = (m + 280) | 0;
    l = (m + 264) | 0;
    d = (m + 284) | 0;
    p = (m + 300) | 0;
    r = m;
    q = (m + 276) | 0;
    o = (m + 296) | 0;
    u = c[e >> 2] | 0;
    w = c[f >> 2] | 0;
    f = c[(g + 4) >> 2] & 74;
    if ((f | 0) == 64) f = 8;
    else if ((f | 0) == 8) f = 16;
    else if (!f) f = 0;
    else f = 10;
    Wk(l, g, s, v);
    c[(d + 0) >> 2] = 0;
    c[(d + 4) >> 2] = 0;
    c[(d + 8) >> 2] = 0;
    Ki(d, 10);
    if (!(a[d >> 0] & 1)) {
      x = (d + 1) | 0;
      e = x;
      t = (d + 8) | 0;
    } else {
      x = (d + 8) | 0;
      e = (d + 1) | 0;
      t = x;
      x = c[x >> 2] | 0;
    }
    c[p >> 2] = x;
    c[q >> 2] = r;
    c[o >> 2] = 0;
    g = (d + 4) | 0;
    v = c[v >> 2] | 0;
    while (1) {
      if (!u) {
        y = 1;
        u = 0;
      } else {
        y = c[(u + 12) >> 2] | 0;
        if ((y | 0) == (c[(u + 16) >> 2] | 0)) y = md[c[((c[u >> 2] | 0) + 36) >> 2] & 127](u) | 0;
        else y = c[y >> 2] | 0;
        A = (y | 0) == -1;
        y = A ? 1 : 0;
        u = A ? 0 : u;
      }
      if (w) {
        z = c[(w + 12) >> 2] | 0;
        if ((z | 0) == (c[(w + 16) >> 2] | 0)) z = md[c[((c[w >> 2] | 0) + 36) >> 2] & 127](w) | 0;
        else z = c[z >> 2] | 0;
        if ((z | 0) != -1) {
          if (!y) break;
        } else k = 20;
      } else k = 20;
      if ((k | 0) == 20) {
        k = 0;
        if (y) {
          w = 0;
          break;
        } else w = 0;
      }
      A = a[d >> 0] | 0;
      y = (A & 1) == 0;
      if (y) z = (A & 255) >>> 1;
      else z = c[g >> 2] | 0;
      if ((c[p >> 2] | 0) == ((x + z) | 0)) {
        if (y) y = (A & 255) >>> 1;
        else y = c[g >> 2] | 0;
        Ki(d, y << 1);
        if (!(a[d >> 0] & 1)) x = 10;
        else x = ((c[d >> 2] & -2) + -1) | 0;
        Ki(d, x);
        if (!(a[d >> 0] & 1)) x = e;
        else x = c[t >> 2] | 0;
        c[p >> 2] = x + y;
      }
      z = (u + 12) | 0;
      A = c[z >> 2] | 0;
      y = (u + 16) | 0;
      if ((A | 0) == (c[y >> 2] | 0)) A = md[c[((c[u >> 2] | 0) + 36) >> 2] & 127](u) | 0;
      else A = c[A >> 2] | 0;
      if (Sk(A, f, x, p, o, v, l, r, q, s) | 0) break;
      A = c[z >> 2] | 0;
      if ((A | 0) == (c[y >> 2] | 0)) {
        md[c[((c[u >> 2] | 0) + 40) >> 2] & 127](u) | 0;
        continue;
      } else {
        c[z >> 2] = A + 4;
        continue;
      }
    }
    s = a[l >> 0] | 0;
    if (!(s & 1)) s = (s & 255) >>> 1;
    else s = c[(l + 4) >> 2] | 0;
    if ((s | 0) != 0 ? ((n = c[q >> 2] | 0), ((n - r) | 0) < 160) : 0) {
      A = c[o >> 2] | 0;
      c[q >> 2] = n + 4;
      c[n >> 2] = A;
    }
    z = Hp(x, c[p >> 2] | 0, h, f) | 0;
    A = j;
    c[A >> 2] = z;
    c[(A + 4) >> 2] = H;
    hn(l, r, c[q >> 2] | 0, h);
    if (!u) {
      j = 0;
      n = 1;
    } else {
      j = c[(u + 12) >> 2] | 0;
      if ((j | 0) == (c[(u + 16) >> 2] | 0)) j = md[c[((c[u >> 2] | 0) + 36) >> 2] & 127](u) | 0;
      else j = c[j >> 2] | 0;
      n = (j | 0) == -1;
      j = n ? 0 : u;
      n = n ? 1 : 0;
    }
    if (w) {
      o = c[(w + 12) >> 2] | 0;
      if ((o | 0) == (c[(w + 16) >> 2] | 0)) o = md[c[((c[w >> 2] | 0) + 36) >> 2] & 127](w) | 0;
      else o = c[o >> 2] | 0;
      if ((o | 0) != -1) {
        if (!n) k = 62;
      } else k = 60;
    } else k = 60;
    if ((k | 0) == 60 ? n : 0) k = 62;
    if ((k | 0) == 62) c[h >> 2] = c[h >> 2] | 2;
    c[b >> 2] = j;
    if (a[d >> 0] & 1) Uq(c[(d + 8) >> 2] | 0);
    if (!(a[l >> 0] & 1)) {
      i = m;
      return;
    }
    Uq(c[(l + 8) >> 2] | 0);
    i = m;
    return;
  }
  function Kk(d, e, f, g, h, j, k) {
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    k = k | 0;
    var l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0,
      y = 0,
      z = 0,
      A = 0,
      B = 0;
    n = i;
    i = (i + 304) | 0;
    t = (n + 160) | 0;
    w = (n + 280) | 0;
    m = (n + 264) | 0;
    e = (n + 284) | 0;
    q = (n + 300) | 0;
    s = n;
    r = (n + 276) | 0;
    p = (n + 296) | 0;
    v = c[f >> 2] | 0;
    x = c[g >> 2] | 0;
    g = c[(h + 4) >> 2] & 74;
    if ((g | 0) == 8) g = 16;
    else if (!g) g = 0;
    else if ((g | 0) == 64) g = 8;
    else g = 10;
    Wk(m, h, t, w);
    c[(e + 0) >> 2] = 0;
    c[(e + 4) >> 2] = 0;
    c[(e + 8) >> 2] = 0;
    Ki(e, 10);
    if (!(a[e >> 0] & 1)) {
      y = (e + 1) | 0;
      f = y;
      u = (e + 8) | 0;
    } else {
      y = (e + 8) | 0;
      f = (e + 1) | 0;
      u = y;
      y = c[y >> 2] | 0;
    }
    c[q >> 2] = y;
    c[r >> 2] = s;
    c[p >> 2] = 0;
    h = (e + 4) | 0;
    w = c[w >> 2] | 0;
    while (1) {
      if (!v) {
        z = 1;
        v = 0;
      } else {
        z = c[(v + 12) >> 2] | 0;
        if ((z | 0) == (c[(v + 16) >> 2] | 0)) z = md[c[((c[v >> 2] | 0) + 36) >> 2] & 127](v) | 0;
        else z = c[z >> 2] | 0;
        B = (z | 0) == -1;
        z = B ? 1 : 0;
        v = B ? 0 : v;
      }
      if (x) {
        A = c[(x + 12) >> 2] | 0;
        if ((A | 0) == (c[(x + 16) >> 2] | 0)) A = md[c[((c[x >> 2] | 0) + 36) >> 2] & 127](x) | 0;
        else A = c[A >> 2] | 0;
        if ((A | 0) != -1) {
          if (!z) break;
        } else l = 20;
      } else l = 20;
      if ((l | 0) == 20) {
        l = 0;
        if (z) {
          x = 0;
          break;
        } else x = 0;
      }
      B = a[e >> 0] | 0;
      z = (B & 1) == 0;
      if (z) A = (B & 255) >>> 1;
      else A = c[h >> 2] | 0;
      if ((c[q >> 2] | 0) == ((y + A) | 0)) {
        if (z) z = (B & 255) >>> 1;
        else z = c[h >> 2] | 0;
        Ki(e, z << 1);
        if (!(a[e >> 0] & 1)) y = 10;
        else y = ((c[e >> 2] & -2) + -1) | 0;
        Ki(e, y);
        if (!(a[e >> 0] & 1)) y = f;
        else y = c[u >> 2] | 0;
        c[q >> 2] = y + z;
      }
      A = (v + 12) | 0;
      B = c[A >> 2] | 0;
      z = (v + 16) | 0;
      if ((B | 0) == (c[z >> 2] | 0)) B = md[c[((c[v >> 2] | 0) + 36) >> 2] & 127](v) | 0;
      else B = c[B >> 2] | 0;
      if (Sk(B, g, y, q, p, w, m, s, r, t) | 0) break;
      B = c[A >> 2] | 0;
      if ((B | 0) == (c[z >> 2] | 0)) {
        md[c[((c[v >> 2] | 0) + 40) >> 2] & 127](v) | 0;
        continue;
      } else {
        c[A >> 2] = B + 4;
        continue;
      }
    }
    t = a[m >> 0] | 0;
    if (!(t & 1)) t = (t & 255) >>> 1;
    else t = c[(m + 4) >> 2] | 0;
    if ((t | 0) != 0 ? ((o = c[r >> 2] | 0), ((o - s) | 0) < 160) : 0) {
      B = c[p >> 2] | 0;
      c[r >> 2] = o + 4;
      c[o >> 2] = B;
    }
    b[k >> 1] = Gp(y, c[q >> 2] | 0, j, g) | 0;
    hn(m, s, c[r >> 2] | 0, j);
    if (!v) {
      k = 0;
      o = 1;
    } else {
      k = c[(v + 12) >> 2] | 0;
      if ((k | 0) == (c[(v + 16) >> 2] | 0)) k = md[c[((c[v >> 2] | 0) + 36) >> 2] & 127](v) | 0;
      else k = c[k >> 2] | 0;
      o = (k | 0) == -1;
      k = o ? 0 : v;
      o = o ? 1 : 0;
    }
    if (x) {
      p = c[(x + 12) >> 2] | 0;
      if ((p | 0) == (c[(x + 16) >> 2] | 0)) p = md[c[((c[x >> 2] | 0) + 36) >> 2] & 127](x) | 0;
      else p = c[p >> 2] | 0;
      if ((p | 0) != -1) {
        if (!o) l = 62;
      } else l = 60;
    } else l = 60;
    if ((l | 0) == 60 ? o : 0) l = 62;
    if ((l | 0) == 62) c[j >> 2] = c[j >> 2] | 2;
    c[d >> 2] = k;
    if (a[e >> 0] & 1) Uq(c[(e + 8) >> 2] | 0);
    if (!(a[m >> 0] & 1)) {
      i = n;
      return;
    }
    Uq(c[(m + 8) >> 2] | 0);
    i = n;
    return;
  }
  function Lk(b, d, e, f, g, h, j) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    var k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0,
      y = 0,
      z = 0,
      A = 0;
    m = i;
    i = (i + 304) | 0;
    s = (m + 160) | 0;
    v = (m + 280) | 0;
    l = (m + 264) | 0;
    d = (m + 284) | 0;
    p = (m + 300) | 0;
    r = m;
    q = (m + 276) | 0;
    o = (m + 296) | 0;
    u = c[e >> 2] | 0;
    w = c[f >> 2] | 0;
    f = c[(g + 4) >> 2] & 74;
    if ((f | 0) == 64) f = 8;
    else if ((f | 0) == 8) f = 16;
    else if (!f) f = 0;
    else f = 10;
    Wk(l, g, s, v);
    c[(d + 0) >> 2] = 0;
    c[(d + 4) >> 2] = 0;
    c[(d + 8) >> 2] = 0;
    Ki(d, 10);
    if (!(a[d >> 0] & 1)) {
      x = (d + 1) | 0;
      e = x;
      t = (d + 8) | 0;
    } else {
      x = (d + 8) | 0;
      e = (d + 1) | 0;
      t = x;
      x = c[x >> 2] | 0;
    }
    c[p >> 2] = x;
    c[q >> 2] = r;
    c[o >> 2] = 0;
    g = (d + 4) | 0;
    v = c[v >> 2] | 0;
    while (1) {
      if (!u) {
        y = 1;
        u = 0;
      } else {
        y = c[(u + 12) >> 2] | 0;
        if ((y | 0) == (c[(u + 16) >> 2] | 0)) y = md[c[((c[u >> 2] | 0) + 36) >> 2] & 127](u) | 0;
        else y = c[y >> 2] | 0;
        A = (y | 0) == -1;
        y = A ? 1 : 0;
        u = A ? 0 : u;
      }
      if (w) {
        z = c[(w + 12) >> 2] | 0;
        if ((z | 0) == (c[(w + 16) >> 2] | 0)) z = md[c[((c[w >> 2] | 0) + 36) >> 2] & 127](w) | 0;
        else z = c[z >> 2] | 0;
        if ((z | 0) != -1) {
          if (!y) break;
        } else k = 20;
      } else k = 20;
      if ((k | 0) == 20) {
        k = 0;
        if (y) {
          w = 0;
          break;
        } else w = 0;
      }
      A = a[d >> 0] | 0;
      y = (A & 1) == 0;
      if (y) z = (A & 255) >>> 1;
      else z = c[g >> 2] | 0;
      if ((c[p >> 2] | 0) == ((x + z) | 0)) {
        if (y) y = (A & 255) >>> 1;
        else y = c[g >> 2] | 0;
        Ki(d, y << 1);
        if (!(a[d >> 0] & 1)) x = 10;
        else x = ((c[d >> 2] & -2) + -1) | 0;
        Ki(d, x);
        if (!(a[d >> 0] & 1)) x = e;
        else x = c[t >> 2] | 0;
        c[p >> 2] = x + y;
      }
      z = (u + 12) | 0;
      A = c[z >> 2] | 0;
      y = (u + 16) | 0;
      if ((A | 0) == (c[y >> 2] | 0)) A = md[c[((c[u >> 2] | 0) + 36) >> 2] & 127](u) | 0;
      else A = c[A >> 2] | 0;
      if (Sk(A, f, x, p, o, v, l, r, q, s) | 0) break;
      A = c[z >> 2] | 0;
      if ((A | 0) == (c[y >> 2] | 0)) {
        md[c[((c[u >> 2] | 0) + 40) >> 2] & 127](u) | 0;
        continue;
      } else {
        c[z >> 2] = A + 4;
        continue;
      }
    }
    s = a[l >> 0] | 0;
    if (!(s & 1)) s = (s & 255) >>> 1;
    else s = c[(l + 4) >> 2] | 0;
    if ((s | 0) != 0 ? ((n = c[q >> 2] | 0), ((n - r) | 0) < 160) : 0) {
      A = c[o >> 2] | 0;
      c[q >> 2] = n + 4;
      c[n >> 2] = A;
    }
    c[j >> 2] = Fp(x, c[p >> 2] | 0, h, f) | 0;
    hn(l, r, c[q >> 2] | 0, h);
    if (!u) {
      j = 0;
      n = 1;
    } else {
      j = c[(u + 12) >> 2] | 0;
      if ((j | 0) == (c[(u + 16) >> 2] | 0)) j = md[c[((c[u >> 2] | 0) + 36) >> 2] & 127](u) | 0;
      else j = c[j >> 2] | 0;
      n = (j | 0) == -1;
      j = n ? 0 : u;
      n = n ? 1 : 0;
    }
    if (w) {
      o = c[(w + 12) >> 2] | 0;
      if ((o | 0) == (c[(w + 16) >> 2] | 0)) o = md[c[((c[w >> 2] | 0) + 36) >> 2] & 127](w) | 0;
      else o = c[o >> 2] | 0;
      if ((o | 0) != -1) {
        if (!n) k = 62;
      } else k = 60;
    } else k = 60;
    if ((k | 0) == 60 ? n : 0) k = 62;
    if ((k | 0) == 62) c[h >> 2] = c[h >> 2] | 2;
    c[b >> 2] = j;
    if (a[d >> 0] & 1) Uq(c[(d + 8) >> 2] | 0);
    if (!(a[l >> 0] & 1)) {
      i = m;
      return;
    }
    Uq(c[(l + 8) >> 2] | 0);
    i = m;
    return;
  }
  function Mk(b, d, e, f, g, h, j) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    var k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0,
      y = 0,
      z = 0,
      A = 0;
    m = i;
    i = (i + 304) | 0;
    s = (m + 160) | 0;
    v = (m + 280) | 0;
    l = (m + 264) | 0;
    d = (m + 284) | 0;
    p = (m + 300) | 0;
    r = m;
    q = (m + 276) | 0;
    o = (m + 296) | 0;
    u = c[e >> 2] | 0;
    w = c[f >> 2] | 0;
    f = c[(g + 4) >> 2] & 74;
    if ((f | 0) == 8) f = 16;
    else if (!f) f = 0;
    else if ((f | 0) == 64) f = 8;
    else f = 10;
    Wk(l, g, s, v);
    c[(d + 0) >> 2] = 0;
    c[(d + 4) >> 2] = 0;
    c[(d + 8) >> 2] = 0;
    Ki(d, 10);
    if (!(a[d >> 0] & 1)) {
      x = (d + 1) | 0;
      e = x;
      t = (d + 8) | 0;
    } else {
      x = (d + 8) | 0;
      e = (d + 1) | 0;
      t = x;
      x = c[x >> 2] | 0;
    }
    c[p >> 2] = x;
    c[q >> 2] = r;
    c[o >> 2] = 0;
    g = (d + 4) | 0;
    v = c[v >> 2] | 0;
    while (1) {
      if (!u) {
        y = 1;
        u = 0;
      } else {
        y = c[(u + 12) >> 2] | 0;
        if ((y | 0) == (c[(u + 16) >> 2] | 0)) y = md[c[((c[u >> 2] | 0) + 36) >> 2] & 127](u) | 0;
        else y = c[y >> 2] | 0;
        A = (y | 0) == -1;
        y = A ? 1 : 0;
        u = A ? 0 : u;
      }
      if (w) {
        z = c[(w + 12) >> 2] | 0;
        if ((z | 0) == (c[(w + 16) >> 2] | 0)) z = md[c[((c[w >> 2] | 0) + 36) >> 2] & 127](w) | 0;
        else z = c[z >> 2] | 0;
        if ((z | 0) != -1) {
          if (!y) break;
        } else k = 20;
      } else k = 20;
      if ((k | 0) == 20) {
        k = 0;
        if (y) {
          w = 0;
          break;
        } else w = 0;
      }
      A = a[d >> 0] | 0;
      y = (A & 1) == 0;
      if (y) z = (A & 255) >>> 1;
      else z = c[g >> 2] | 0;
      if ((c[p >> 2] | 0) == ((x + z) | 0)) {
        if (y) y = (A & 255) >>> 1;
        else y = c[g >> 2] | 0;
        Ki(d, y << 1);
        if (!(a[d >> 0] & 1)) x = 10;
        else x = ((c[d >> 2] & -2) + -1) | 0;
        Ki(d, x);
        if (!(a[d >> 0] & 1)) x = e;
        else x = c[t >> 2] | 0;
        c[p >> 2] = x + y;
      }
      z = (u + 12) | 0;
      A = c[z >> 2] | 0;
      y = (u + 16) | 0;
      if ((A | 0) == (c[y >> 2] | 0)) A = md[c[((c[u >> 2] | 0) + 36) >> 2] & 127](u) | 0;
      else A = c[A >> 2] | 0;
      if (Sk(A, f, x, p, o, v, l, r, q, s) | 0) break;
      A = c[z >> 2] | 0;
      if ((A | 0) == (c[y >> 2] | 0)) {
        md[c[((c[u >> 2] | 0) + 40) >> 2] & 127](u) | 0;
        continue;
      } else {
        c[z >> 2] = A + 4;
        continue;
      }
    }
    s = a[l >> 0] | 0;
    if (!(s & 1)) s = (s & 255) >>> 1;
    else s = c[(l + 4) >> 2] | 0;
    if ((s | 0) != 0 ? ((n = c[q >> 2] | 0), ((n - r) | 0) < 160) : 0) {
      A = c[o >> 2] | 0;
      c[q >> 2] = n + 4;
      c[n >> 2] = A;
    }
    c[j >> 2] = Ep(x, c[p >> 2] | 0, h, f) | 0;
    hn(l, r, c[q >> 2] | 0, h);
    if (!u) {
      j = 0;
      n = 1;
    } else {
      j = c[(u + 12) >> 2] | 0;
      if ((j | 0) == (c[(u + 16) >> 2] | 0)) j = md[c[((c[u >> 2] | 0) + 36) >> 2] & 127](u) | 0;
      else j = c[j >> 2] | 0;
      n = (j | 0) == -1;
      j = n ? 0 : u;
      n = n ? 1 : 0;
    }
    if (w) {
      o = c[(w + 12) >> 2] | 0;
      if ((o | 0) == (c[(w + 16) >> 2] | 0)) o = md[c[((c[w >> 2] | 0) + 36) >> 2] & 127](w) | 0;
      else o = c[o >> 2] | 0;
      if ((o | 0) != -1) {
        if (!n) k = 62;
      } else k = 60;
    } else k = 60;
    if ((k | 0) == 60 ? n : 0) k = 62;
    if ((k | 0) == 62) c[h >> 2] = c[h >> 2] | 2;
    c[b >> 2] = j;
    if (a[d >> 0] & 1) Uq(c[(d + 8) >> 2] | 0);
    if (!(a[l >> 0] & 1)) {
      i = m;
      return;
    }
    Uq(c[(l + 8) >> 2] | 0);
    i = m;
    return;
  }
  function Nk(b, d, e, f, g, h, j) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    var k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0,
      y = 0,
      z = 0,
      A = 0;
    m = i;
    i = (i + 304) | 0;
    s = (m + 160) | 0;
    v = (m + 280) | 0;
    l = (m + 264) | 0;
    d = (m + 284) | 0;
    p = (m + 300) | 0;
    r = m;
    q = (m + 276) | 0;
    o = (m + 296) | 0;
    u = c[e >> 2] | 0;
    w = c[f >> 2] | 0;
    f = c[(g + 4) >> 2] & 74;
    if ((f | 0) == 64) f = 8;
    else if ((f | 0) == 8) f = 16;
    else if (!f) f = 0;
    else f = 10;
    Wk(l, g, s, v);
    c[(d + 0) >> 2] = 0;
    c[(d + 4) >> 2] = 0;
    c[(d + 8) >> 2] = 0;
    Ki(d, 10);
    if (!(a[d >> 0] & 1)) {
      x = (d + 1) | 0;
      e = x;
      t = (d + 8) | 0;
    } else {
      x = (d + 8) | 0;
      e = (d + 1) | 0;
      t = x;
      x = c[x >> 2] | 0;
    }
    c[p >> 2] = x;
    c[q >> 2] = r;
    c[o >> 2] = 0;
    g = (d + 4) | 0;
    v = c[v >> 2] | 0;
    while (1) {
      if (!u) {
        y = 1;
        u = 0;
      } else {
        y = c[(u + 12) >> 2] | 0;
        if ((y | 0) == (c[(u + 16) >> 2] | 0)) y = md[c[((c[u >> 2] | 0) + 36) >> 2] & 127](u) | 0;
        else y = c[y >> 2] | 0;
        A = (y | 0) == -1;
        y = A ? 1 : 0;
        u = A ? 0 : u;
      }
      if (w) {
        z = c[(w + 12) >> 2] | 0;
        if ((z | 0) == (c[(w + 16) >> 2] | 0)) z = md[c[((c[w >> 2] | 0) + 36) >> 2] & 127](w) | 0;
        else z = c[z >> 2] | 0;
        if ((z | 0) != -1) {
          if (!y) break;
        } else k = 20;
      } else k = 20;
      if ((k | 0) == 20) {
        k = 0;
        if (y) {
          w = 0;
          break;
        } else w = 0;
      }
      A = a[d >> 0] | 0;
      y = (A & 1) == 0;
      if (y) z = (A & 255) >>> 1;
      else z = c[g >> 2] | 0;
      if ((c[p >> 2] | 0) == ((x + z) | 0)) {
        if (y) y = (A & 255) >>> 1;
        else y = c[g >> 2] | 0;
        Ki(d, y << 1);
        if (!(a[d >> 0] & 1)) x = 10;
        else x = ((c[d >> 2] & -2) + -1) | 0;
        Ki(d, x);
        if (!(a[d >> 0] & 1)) x = e;
        else x = c[t >> 2] | 0;
        c[p >> 2] = x + y;
      }
      z = (u + 12) | 0;
      A = c[z >> 2] | 0;
      y = (u + 16) | 0;
      if ((A | 0) == (c[y >> 2] | 0)) A = md[c[((c[u >> 2] | 0) + 36) >> 2] & 127](u) | 0;
      else A = c[A >> 2] | 0;
      if (Sk(A, f, x, p, o, v, l, r, q, s) | 0) break;
      A = c[z >> 2] | 0;
      if ((A | 0) == (c[y >> 2] | 0)) {
        md[c[((c[u >> 2] | 0) + 40) >> 2] & 127](u) | 0;
        continue;
      } else {
        c[z >> 2] = A + 4;
        continue;
      }
    }
    s = a[l >> 0] | 0;
    if (!(s & 1)) s = (s & 255) >>> 1;
    else s = c[(l + 4) >> 2] | 0;
    if ((s | 0) != 0 ? ((n = c[q >> 2] | 0), ((n - r) | 0) < 160) : 0) {
      A = c[o >> 2] | 0;
      c[q >> 2] = n + 4;
      c[n >> 2] = A;
    }
    z = Dp(x, c[p >> 2] | 0, h, f) | 0;
    A = j;
    c[A >> 2] = z;
    c[(A + 4) >> 2] = H;
    hn(l, r, c[q >> 2] | 0, h);
    if (!u) {
      j = 0;
      n = 1;
    } else {
      j = c[(u + 12) >> 2] | 0;
      if ((j | 0) == (c[(u + 16) >> 2] | 0)) j = md[c[((c[u >> 2] | 0) + 36) >> 2] & 127](u) | 0;
      else j = c[j >> 2] | 0;
      n = (j | 0) == -1;
      j = n ? 0 : u;
      n = n ? 1 : 0;
    }
    if (w) {
      o = c[(w + 12) >> 2] | 0;
      if ((o | 0) == (c[(w + 16) >> 2] | 0)) o = md[c[((c[w >> 2] | 0) + 36) >> 2] & 127](w) | 0;
      else o = c[o >> 2] | 0;
      if ((o | 0) != -1) {
        if (!n) k = 62;
      } else k = 60;
    } else k = 60;
    if ((k | 0) == 60 ? n : 0) k = 62;
    if ((k | 0) == 62) c[h >> 2] = c[h >> 2] | 2;
    c[b >> 2] = j;
    if (a[d >> 0] & 1) Uq(c[(d + 8) >> 2] | 0);
    if (!(a[l >> 0] & 1)) {
      i = m;
      return;
    }
    Uq(c[(l + 8) >> 2] | 0);
    i = m;
    return;
  }
  function Ok(b, d, e, f, h, j, k) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    h = h | 0;
    j = j | 0;
    k = k | 0;
    var l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0,
      y = 0,
      z = 0,
      A = 0,
      B = 0,
      C = 0,
      D = 0;
    m = i;
    i = (i + 352) | 0;
    v = (m + 208) | 0;
    w = (m + 184) | 0;
    x = (m + 4) | 0;
    n = (m + 8) | 0;
    d = (m + 196) | 0;
    p = m;
    t = (m + 24) | 0;
    s = (m + 192) | 0;
    r = (m + 188) | 0;
    q = (m + 337) | 0;
    u = (m + 336) | 0;
    y = c[e >> 2] | 0;
    z = c[f >> 2] | 0;
    Xk(n, h, v, w, x);
    c[(d + 0) >> 2] = 0;
    c[(d + 4) >> 2] = 0;
    c[(d + 8) >> 2] = 0;
    Ki(d, 10);
    if (!(a[d >> 0] & 1)) {
      A = (d + 1) | 0;
      f = A;
      h = (d + 8) | 0;
    } else {
      A = (d + 8) | 0;
      f = (d + 1) | 0;
      h = A;
      A = c[A >> 2] | 0;
    }
    c[p >> 2] = A;
    c[s >> 2] = t;
    c[r >> 2] = 0;
    a[q >> 0] = 1;
    a[u >> 0] = 69;
    e = (d + 4) | 0;
    w = c[w >> 2] | 0;
    x = c[x >> 2] | 0;
    while (1) {
      if (!y) {
        B = 1;
        y = 0;
      } else {
        B = c[(y + 12) >> 2] | 0;
        if ((B | 0) == (c[(y + 16) >> 2] | 0)) B = md[c[((c[y >> 2] | 0) + 36) >> 2] & 127](y) | 0;
        else B = c[B >> 2] | 0;
        D = (B | 0) == -1;
        B = D ? 1 : 0;
        y = D ? 0 : y;
      }
      if (z) {
        C = c[(z + 12) >> 2] | 0;
        if ((C | 0) == (c[(z + 16) >> 2] | 0)) C = md[c[((c[z >> 2] | 0) + 36) >> 2] & 127](z) | 0;
        else C = c[C >> 2] | 0;
        if ((C | 0) != -1) {
          if (!B) break;
        } else l = 16;
      } else l = 16;
      if ((l | 0) == 16) {
        l = 0;
        if (B) {
          z = 0;
          break;
        } else z = 0;
      }
      D = a[d >> 0] | 0;
      B = (D & 1) == 0;
      if (B) C = (D & 255) >>> 1;
      else C = c[e >> 2] | 0;
      if ((c[p >> 2] | 0) == ((A + C) | 0)) {
        if (B) B = (D & 255) >>> 1;
        else B = c[e >> 2] | 0;
        Ki(d, B << 1);
        if (!(a[d >> 0] & 1)) A = 10;
        else A = ((c[d >> 2] & -2) + -1) | 0;
        Ki(d, A);
        if (!(a[d >> 0] & 1)) A = f;
        else A = c[h >> 2] | 0;
        c[p >> 2] = A + B;
      }
      C = (y + 12) | 0;
      D = c[C >> 2] | 0;
      B = (y + 16) | 0;
      if ((D | 0) == (c[B >> 2] | 0)) D = md[c[((c[y >> 2] | 0) + 36) >> 2] & 127](y) | 0;
      else D = c[D >> 2] | 0;
      if (Yk(D, q, u, A, p, w, x, n, t, s, r, v) | 0) break;
      D = c[C >> 2] | 0;
      if ((D | 0) == (c[B >> 2] | 0)) {
        md[c[((c[y >> 2] | 0) + 40) >> 2] & 127](y) | 0;
        continue;
      } else {
        c[C >> 2] = D + 4;
        continue;
      }
    }
    u = a[n >> 0] | 0;
    if (!(u & 1)) u = (u & 255) >>> 1;
    else u = c[(n + 4) >> 2] | 0;
    if (
      ((u | 0) != 0 ? (a[q >> 0] | 0) != 0 : 0) ? ((o = c[s >> 2] | 0), ((o - t) | 0) < 160) : 0
    ) {
      D = c[r >> 2] | 0;
      c[s >> 2] = o + 4;
      c[o >> 2] = D;
    }
    g[k >> 2] = +Cp(A, c[p >> 2] | 0, j);
    hn(n, t, c[s >> 2] | 0, j);
    if (!y) {
      k = 0;
      o = 1;
    } else {
      k = c[(y + 12) >> 2] | 0;
      if ((k | 0) == (c[(y + 16) >> 2] | 0)) k = md[c[((c[y >> 2] | 0) + 36) >> 2] & 127](y) | 0;
      else k = c[k >> 2] | 0;
      o = (k | 0) == -1;
      k = o ? 0 : y;
      o = o ? 1 : 0;
    }
    if (z) {
      p = c[(z + 12) >> 2] | 0;
      if ((p | 0) == (c[(z + 16) >> 2] | 0)) p = md[c[((c[z >> 2] | 0) + 36) >> 2] & 127](z) | 0;
      else p = c[p >> 2] | 0;
      if ((p | 0) != -1) {
        if (!o) l = 59;
      } else l = 57;
    } else l = 57;
    if ((l | 0) == 57 ? o : 0) l = 59;
    if ((l | 0) == 59) c[j >> 2] = c[j >> 2] | 2;
    c[b >> 2] = k;
    if (a[d >> 0] & 1) Uq(c[(d + 8) >> 2] | 0);
    if (!(a[n >> 0] & 1)) {
      i = m;
      return;
    }
    Uq(c[(n + 8) >> 2] | 0);
    i = m;
    return;
  }
  function Pk(b, d, e, f, g, j, k) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    j = j | 0;
    k = k | 0;
    var l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0,
      y = 0,
      z = 0,
      A = 0,
      B = 0,
      C = 0,
      D = 0;
    m = i;
    i = (i + 352) | 0;
    v = (m + 208) | 0;
    w = (m + 184) | 0;
    x = (m + 4) | 0;
    n = (m + 8) | 0;
    d = (m + 196) | 0;
    p = m;
    t = (m + 24) | 0;
    s = (m + 192) | 0;
    r = (m + 188) | 0;
    q = (m + 337) | 0;
    u = (m + 336) | 0;
    y = c[e >> 2] | 0;
    z = c[f >> 2] | 0;
    Xk(n, g, v, w, x);
    c[(d + 0) >> 2] = 0;
    c[(d + 4) >> 2] = 0;
    c[(d + 8) >> 2] = 0;
    Ki(d, 10);
    if (!(a[d >> 0] & 1)) {
      A = (d + 1) | 0;
      f = A;
      g = (d + 8) | 0;
    } else {
      A = (d + 8) | 0;
      f = (d + 1) | 0;
      g = A;
      A = c[A >> 2] | 0;
    }
    c[p >> 2] = A;
    c[s >> 2] = t;
    c[r >> 2] = 0;
    a[q >> 0] = 1;
    a[u >> 0] = 69;
    e = (d + 4) | 0;
    w = c[w >> 2] | 0;
    x = c[x >> 2] | 0;
    while (1) {
      if (!y) {
        B = 1;
        y = 0;
      } else {
        B = c[(y + 12) >> 2] | 0;
        if ((B | 0) == (c[(y + 16) >> 2] | 0)) B = md[c[((c[y >> 2] | 0) + 36) >> 2] & 127](y) | 0;
        else B = c[B >> 2] | 0;
        D = (B | 0) == -1;
        B = D ? 1 : 0;
        y = D ? 0 : y;
      }
      if (z) {
        C = c[(z + 12) >> 2] | 0;
        if ((C | 0) == (c[(z + 16) >> 2] | 0)) C = md[c[((c[z >> 2] | 0) + 36) >> 2] & 127](z) | 0;
        else C = c[C >> 2] | 0;
        if ((C | 0) != -1) {
          if (!B) break;
        } else l = 16;
      } else l = 16;
      if ((l | 0) == 16) {
        l = 0;
        if (B) {
          z = 0;
          break;
        } else z = 0;
      }
      D = a[d >> 0] | 0;
      B = (D & 1) == 0;
      if (B) C = (D & 255) >>> 1;
      else C = c[e >> 2] | 0;
      if ((c[p >> 2] | 0) == ((A + C) | 0)) {
        if (B) B = (D & 255) >>> 1;
        else B = c[e >> 2] | 0;
        Ki(d, B << 1);
        if (!(a[d >> 0] & 1)) A = 10;
        else A = ((c[d >> 2] & -2) + -1) | 0;
        Ki(d, A);
        if (!(a[d >> 0] & 1)) A = f;
        else A = c[g >> 2] | 0;
        c[p >> 2] = A + B;
      }
      C = (y + 12) | 0;
      D = c[C >> 2] | 0;
      B = (y + 16) | 0;
      if ((D | 0) == (c[B >> 2] | 0)) D = md[c[((c[y >> 2] | 0) + 36) >> 2] & 127](y) | 0;
      else D = c[D >> 2] | 0;
      if (Yk(D, q, u, A, p, w, x, n, t, s, r, v) | 0) break;
      D = c[C >> 2] | 0;
      if ((D | 0) == (c[B >> 2] | 0)) {
        md[c[((c[y >> 2] | 0) + 40) >> 2] & 127](y) | 0;
        continue;
      } else {
        c[C >> 2] = D + 4;
        continue;
      }
    }
    u = a[n >> 0] | 0;
    if (!(u & 1)) u = (u & 255) >>> 1;
    else u = c[(n + 4) >> 2] | 0;
    if (
      ((u | 0) != 0 ? (a[q >> 0] | 0) != 0 : 0) ? ((o = c[s >> 2] | 0), ((o - t) | 0) < 160) : 0
    ) {
      D = c[r >> 2] | 0;
      c[s >> 2] = o + 4;
      c[o >> 2] = D;
    }
    h[k >> 3] = +Bp(A, c[p >> 2] | 0, j);
    hn(n, t, c[s >> 2] | 0, j);
    if (!y) {
      k = 0;
      o = 1;
    } else {
      k = c[(y + 12) >> 2] | 0;
      if ((k | 0) == (c[(y + 16) >> 2] | 0)) k = md[c[((c[y >> 2] | 0) + 36) >> 2] & 127](y) | 0;
      else k = c[k >> 2] | 0;
      o = (k | 0) == -1;
      k = o ? 0 : y;
      o = o ? 1 : 0;
    }
    if (z) {
      p = c[(z + 12) >> 2] | 0;
      if ((p | 0) == (c[(z + 16) >> 2] | 0)) p = md[c[((c[z >> 2] | 0) + 36) >> 2] & 127](z) | 0;
      else p = c[p >> 2] | 0;
      if ((p | 0) != -1) {
        if (!o) l = 59;
      } else l = 57;
    } else l = 57;
    if ((l | 0) == 57 ? o : 0) l = 59;
    if ((l | 0) == 59) c[j >> 2] = c[j >> 2] | 2;
    c[b >> 2] = k;
    if (a[d >> 0] & 1) Uq(c[(d + 8) >> 2] | 0);
    if (!(a[n >> 0] & 1)) {
      i = m;
      return;
    }
    Uq(c[(n + 8) >> 2] | 0);
    i = m;
    return;
  }
  function Qk(b, d, e, f, g, j, k) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    j = j | 0;
    k = k | 0;
    var l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0,
      y = 0,
      z = 0,
      A = 0,
      B = 0,
      C = 0,
      D = 0;
    m = i;
    i = (i + 352) | 0;
    v = (m + 208) | 0;
    w = (m + 184) | 0;
    x = (m + 4) | 0;
    n = (m + 8) | 0;
    d = (m + 196) | 0;
    p = m;
    t = (m + 24) | 0;
    s = (m + 192) | 0;
    r = (m + 188) | 0;
    q = (m + 337) | 0;
    u = (m + 336) | 0;
    y = c[e >> 2] | 0;
    z = c[f >> 2] | 0;
    Xk(n, g, v, w, x);
    c[(d + 0) >> 2] = 0;
    c[(d + 4) >> 2] = 0;
    c[(d + 8) >> 2] = 0;
    Ki(d, 10);
    if (!(a[d >> 0] & 1)) {
      A = (d + 1) | 0;
      f = A;
      g = (d + 8) | 0;
    } else {
      A = (d + 8) | 0;
      f = (d + 1) | 0;
      g = A;
      A = c[A >> 2] | 0;
    }
    c[p >> 2] = A;
    c[s >> 2] = t;
    c[r >> 2] = 0;
    a[q >> 0] = 1;
    a[u >> 0] = 69;
    e = (d + 4) | 0;
    w = c[w >> 2] | 0;
    x = c[x >> 2] | 0;
    while (1) {
      if (!y) {
        B = 1;
        y = 0;
      } else {
        B = c[(y + 12) >> 2] | 0;
        if ((B | 0) == (c[(y + 16) >> 2] | 0)) B = md[c[((c[y >> 2] | 0) + 36) >> 2] & 127](y) | 0;
        else B = c[B >> 2] | 0;
        D = (B | 0) == -1;
        B = D ? 1 : 0;
        y = D ? 0 : y;
      }
      if (z) {
        C = c[(z + 12) >> 2] | 0;
        if ((C | 0) == (c[(z + 16) >> 2] | 0)) C = md[c[((c[z >> 2] | 0) + 36) >> 2] & 127](z) | 0;
        else C = c[C >> 2] | 0;
        if ((C | 0) != -1) {
          if (!B) break;
        } else l = 16;
      } else l = 16;
      if ((l | 0) == 16) {
        l = 0;
        if (B) {
          z = 0;
          break;
        } else z = 0;
      }
      D = a[d >> 0] | 0;
      B = (D & 1) == 0;
      if (B) C = (D & 255) >>> 1;
      else C = c[e >> 2] | 0;
      if ((c[p >> 2] | 0) == ((A + C) | 0)) {
        if (B) B = (D & 255) >>> 1;
        else B = c[e >> 2] | 0;
        Ki(d, B << 1);
        if (!(a[d >> 0] & 1)) A = 10;
        else A = ((c[d >> 2] & -2) + -1) | 0;
        Ki(d, A);
        if (!(a[d >> 0] & 1)) A = f;
        else A = c[g >> 2] | 0;
        c[p >> 2] = A + B;
      }
      C = (y + 12) | 0;
      D = c[C >> 2] | 0;
      B = (y + 16) | 0;
      if ((D | 0) == (c[B >> 2] | 0)) D = md[c[((c[y >> 2] | 0) + 36) >> 2] & 127](y) | 0;
      else D = c[D >> 2] | 0;
      if (Yk(D, q, u, A, p, w, x, n, t, s, r, v) | 0) break;
      D = c[C >> 2] | 0;
      if ((D | 0) == (c[B >> 2] | 0)) {
        md[c[((c[y >> 2] | 0) + 40) >> 2] & 127](y) | 0;
        continue;
      } else {
        c[C >> 2] = D + 4;
        continue;
      }
    }
    u = a[n >> 0] | 0;
    if (!(u & 1)) u = (u & 255) >>> 1;
    else u = c[(n + 4) >> 2] | 0;
    if (
      ((u | 0) != 0 ? (a[q >> 0] | 0) != 0 : 0) ? ((o = c[s >> 2] | 0), ((o - t) | 0) < 160) : 0
    ) {
      D = c[r >> 2] | 0;
      c[s >> 2] = o + 4;
      c[o >> 2] = D;
    }
    h[k >> 3] = +Ap(A, c[p >> 2] | 0, j);
    hn(n, t, c[s >> 2] | 0, j);
    if (!y) {
      k = 0;
      o = 1;
    } else {
      k = c[(y + 12) >> 2] | 0;
      if ((k | 0) == (c[(y + 16) >> 2] | 0)) k = md[c[((c[y >> 2] | 0) + 36) >> 2] & 127](y) | 0;
      else k = c[k >> 2] | 0;
      o = (k | 0) == -1;
      k = o ? 0 : y;
      o = o ? 1 : 0;
    }
    if (z) {
      p = c[(z + 12) >> 2] | 0;
      if ((p | 0) == (c[(z + 16) >> 2] | 0)) p = md[c[((c[z >> 2] | 0) + 36) >> 2] & 127](z) | 0;
      else p = c[p >> 2] | 0;
      if ((p | 0) != -1) {
        if (!o) l = 59;
      } else l = 57;
    } else l = 57;
    if ((l | 0) == 57 ? o : 0) l = 59;
    if ((l | 0) == 59) c[j >> 2] = c[j >> 2] | 2;
    c[b >> 2] = k;
    if (a[d >> 0] & 1) Uq(c[(d + 8) >> 2] | 0);
    if (!(a[n >> 0] & 1)) {
      i = m;
      return;
    }
    Uq(c[(n + 8) >> 2] | 0);
    i = m;
    return;
  }
  function Rk(b, d, e, f, g, h, j) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    var k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0,
      y = 0,
      z = 0,
      A = 0;
    d = i;
    i = (i + 320) | 0;
    n = d;
    p = (d + 168) | 0;
    l = (d + 288) | 0;
    m = (d + 276) | 0;
    o = (d + 300) | 0;
    q = (d + 8) | 0;
    s = (d + 272) | 0;
    r = (d + 304) | 0;
    c[(l + 0) >> 2] = 0;
    c[(l + 4) >> 2] = 0;
    c[(l + 8) >> 2] = 0;
    g = c[(g + 28) >> 2] | 0;
    z = (g + 4) | 0;
    c[z >> 2] = (c[z >> 2] | 0) + 1;
    z = Sn(g, 19064) | 0;
    sd[c[((c[z >> 2] | 0) + 48) >> 2] & 7](z, 17600, 17626 | 0, p) | 0;
    z = (g + 4) | 0;
    A = c[z >> 2] | 0;
    c[z >> 2] = A + -1;
    if (!A) jd[c[((c[g >> 2] | 0) + 8) >> 2] & 255](g);
    c[(m + 0) >> 2] = 0;
    c[(m + 4) >> 2] = 0;
    c[(m + 8) >> 2] = 0;
    Ki(m, 10);
    if (!(a[m >> 0] & 1)) {
      w = (m + 1) | 0;
      g = w;
      t = (m + 8) | 0;
    } else {
      w = (m + 8) | 0;
      g = (m + 1) | 0;
      t = w;
      w = c[w >> 2] | 0;
    }
    c[o >> 2] = w;
    c[s >> 2] = q;
    c[r >> 2] = 0;
    v = (m + 4) | 0;
    u = c[e >> 2] | 0;
    a: while (1) {
      if (u) {
        x = c[(u + 12) >> 2] | 0;
        if ((x | 0) == (c[(u + 16) >> 2] | 0)) x = md[c[((c[u >> 2] | 0) + 36) >> 2] & 127](u) | 0;
        else x = c[x >> 2] | 0;
        if ((x | 0) == -1) {
          c[e >> 2] = 0;
          y = 1;
          u = 0;
        } else y = 0;
      } else {
        y = 1;
        u = 0;
      }
      x = c[f >> 2] | 0;
      do
        if (x) {
          z = c[(x + 12) >> 2] | 0;
          if ((z | 0) == (c[(x + 16) >> 2] | 0))
            z = md[c[((c[x >> 2] | 0) + 36) >> 2] & 127](x) | 0;
          else z = c[z >> 2] | 0;
          if ((z | 0) != -1)
            if (y) break;
            else break a;
          else {
            c[f >> 2] = 0;
            k = 22;
            break;
          }
        } else k = 22;
      while (0);
      if ((k | 0) == 22) {
        k = 0;
        if (y) {
          x = 0;
          break;
        } else x = 0;
      }
      A = a[m >> 0] | 0;
      z = (A & 1) == 0;
      if (z) y = (A & 255) >>> 1;
      else y = c[v >> 2] | 0;
      if ((c[o >> 2] | 0) == ((w + y) | 0)) {
        if (z) y = (A & 255) >>> 1;
        else y = c[v >> 2] | 0;
        Ki(m, y << 1);
        if (!(a[m >> 0] & 1)) w = 10;
        else w = ((c[m >> 2] & -2) + -1) | 0;
        Ki(m, w);
        if (!(a[m >> 0] & 1)) w = g;
        else w = c[t >> 2] | 0;
        c[o >> 2] = w + y;
      }
      z = (u + 12) | 0;
      A = c[z >> 2] | 0;
      y = (u + 16) | 0;
      if ((A | 0) == (c[y >> 2] | 0)) A = md[c[((c[u >> 2] | 0) + 36) >> 2] & 127](u) | 0;
      else A = c[A >> 2] | 0;
      if (Sk(A, 16, w, o, r, 0, l, q, s, p) | 0) break;
      x = c[z >> 2] | 0;
      if ((x | 0) == (c[y >> 2] | 0)) {
        md[c[((c[u >> 2] | 0) + 40) >> 2] & 127](u) | 0;
        continue;
      } else {
        c[z >> 2] = x + 4;
        continue;
      }
    }
    Ki(m, ((c[o >> 2] | 0) - w) | 0);
    if (a[m >> 0] & 1) g = c[t >> 2] | 0;
    A = Dk() | 0;
    c[n >> 2] = j;
    if ((Ck(g, A, n) | 0) != 1) c[h >> 2] = 4;
    if (u) {
      j = c[(u + 12) >> 2] | 0;
      if ((j | 0) == (c[(u + 16) >> 2] | 0)) j = md[c[((c[u >> 2] | 0) + 36) >> 2] & 127](u) | 0;
      else j = c[j >> 2] | 0;
      if ((j | 0) == -1) {
        c[e >> 2] = 0;
        u = 0;
        e = 1;
      } else e = 0;
    } else {
      u = 0;
      e = 1;
    }
    do
      if (x) {
        j = c[(x + 12) >> 2] | 0;
        if ((j | 0) == (c[(x + 16) >> 2] | 0)) j = md[c[((c[x >> 2] | 0) + 36) >> 2] & 127](x) | 0;
        else j = c[j >> 2] | 0;
        if ((j | 0) != -1)
          if (e) break;
          else {
            k = 66;
            break;
          }
        else {
          c[f >> 2] = 0;
          k = 64;
          break;
        }
      } else k = 64;
    while (0);
    if ((k | 0) == 64 ? e : 0) k = 66;
    if ((k | 0) == 66) c[h >> 2] = c[h >> 2] | 2;
    c[b >> 2] = u;
    if (a[m >> 0] & 1) Uq(c[(m + 8) >> 2] | 0);
    if (!(a[l >> 0] & 1)) {
      i = d;
      return;
    }
    Uq(c[(l + 8) >> 2] | 0);
    i = d;
    return;
  }
  function Sk(b, d, e, f, g, h, j, k, l, m) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    k = k | 0;
    l = l | 0;
    m = m | 0;
    var n = 0,
      o = 0,
      p = 0,
      q = 0;
    n = i;
    p = c[f >> 2] | 0;
    o = (p | 0) == (e | 0);
    do
      if (o) {
        q = (c[(m + 96) >> 2] | 0) == (b | 0);
        if (!q ? (c[(m + 100) >> 2] | 0) != (b | 0) : 0) break;
        c[f >> 2] = e + 1;
        a[e >> 0] = q ? 43 : 45;
        c[g >> 2] = 0;
        q = 0;
        i = n;
        return q | 0;
      }
    while (0);
    q = a[j >> 0] | 0;
    if (!(q & 1)) j = (q & 255) >>> 1;
    else j = c[(j + 4) >> 2] | 0;
    if (((j | 0) != 0) & ((b | 0) == (h | 0))) {
      o = c[l >> 2] | 0;
      if (((o - k) | 0) >= 160) {
        q = 0;
        i = n;
        return q | 0;
      }
      q = c[g >> 2] | 0;
      c[l >> 2] = o + 4;
      c[o >> 2] = q;
      c[g >> 2] = 0;
      q = 0;
      i = n;
      return q | 0;
    }
    l = (m + 104) | 0;
    k = m;
    while (1) {
      if ((c[k >> 2] | 0) == (b | 0)) break;
      k = (k + 4) | 0;
      if ((k | 0) == (l | 0)) {
        k = l;
        break;
      }
    }
    b = (k - m) | 0;
    m = b >> 2;
    if ((b | 0) > 92) {
      q = -1;
      i = n;
      return q | 0;
    }
    if (((d | 0) == 10) | ((d | 0) == 8)) {
      if ((m | 0) >= (d | 0)) {
        q = -1;
        i = n;
        return q | 0;
      }
    } else if ((d | 0) == 16 ? (b | 0) >= 88 : 0) {
      if (o) {
        q = -1;
        i = n;
        return q | 0;
      }
      if (((p - e) | 0) >= 3) {
        q = -1;
        i = n;
        return q | 0;
      }
      if ((a[(p + -1) >> 0] | 0) != 48) {
        q = -1;
        i = n;
        return q | 0;
      }
      c[g >> 2] = 0;
      q = a[(17600 + m) >> 0] | 0;
      c[f >> 2] = p + 1;
      a[p >> 0] = q;
      q = 0;
      i = n;
      return q | 0;
    }
    q = a[(17600 + m) >> 0] | 0;
    c[f >> 2] = p + 1;
    a[p >> 0] = q;
    c[g >> 2] = (c[g >> 2] | 0) + 1;
    q = 0;
    i = n;
    return q | 0;
  }
  function Tk(b, d, e, f) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    var g = 0,
      h = 0;
    g = i;
    d = c[(d + 28) >> 2] | 0;
    h = (d + 4) | 0;
    c[h >> 2] = (c[h >> 2] | 0) + 1;
    h = Sn(d, 19072) | 0;
    sd[c[((c[h >> 2] | 0) + 32) >> 2] & 7](h, 17600, 17626 | 0, e) | 0;
    e = Sn(d, 19216) | 0;
    a[f >> 0] = md[c[((c[e >> 2] | 0) + 16) >> 2] & 127](e) | 0;
    kd[c[((c[e >> 2] | 0) + 20) >> 2] & 63](b, e);
    f = (d + 4) | 0;
    e = c[f >> 2] | 0;
    c[f >> 2] = e + -1;
    if (e) {
      i = g;
      return;
    }
    jd[c[((c[d >> 2] | 0) + 8) >> 2] & 255](d);
    i = g;
    return;
  }
  function Uk(b, d, e, f, g) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    var h = 0,
      j = 0;
    h = i;
    d = c[(d + 28) >> 2] | 0;
    j = (d + 4) | 0;
    c[j >> 2] = (c[j >> 2] | 0) + 1;
    j = Sn(d, 19072) | 0;
    sd[c[((c[j >> 2] | 0) + 32) >> 2] & 7](j, 17600, 17632 | 0, e) | 0;
    e = Sn(d, 19216) | 0;
    a[f >> 0] = md[c[((c[e >> 2] | 0) + 12) >> 2] & 127](e) | 0;
    a[g >> 0] = md[c[((c[e >> 2] | 0) + 16) >> 2] & 127](e) | 0;
    kd[c[((c[e >> 2] | 0) + 20) >> 2] & 63](b, e);
    f = (d + 4) | 0;
    e = c[f >> 2] | 0;
    c[f >> 2] = e + -1;
    if (e) {
      i = h;
      return;
    }
    jd[c[((c[d >> 2] | 0) + 8) >> 2] & 255](d);
    i = h;
    return;
  }
  function Vk(b, e, f, g, h, j, k, l, m, n, o, p) {
    b = b | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    k = k | 0;
    l = l | 0;
    m = m | 0;
    n = n | 0;
    o = o | 0;
    p = p | 0;
    var q = 0,
      r = 0;
    q = i;
    if ((b << 24) >> 24 == (j << 24) >> 24) {
      if (!(a[e >> 0] | 0)) {
        k = -1;
        i = q;
        return k | 0;
      }
      a[e >> 0] = 0;
      k = c[h >> 2] | 0;
      c[h >> 2] = k + 1;
      a[k >> 0] = 46;
      h = a[l >> 0] | 0;
      if (!(h & 1)) h = (h & 255) >>> 1;
      else h = c[(l + 4) >> 2] | 0;
      if (!h) {
        k = 0;
        i = q;
        return k | 0;
      }
      h = c[n >> 2] | 0;
      if (((h - m) | 0) >= 160) {
        k = 0;
        i = q;
        return k | 0;
      }
      k = c[o >> 2] | 0;
      c[n >> 2] = h + 4;
      c[h >> 2] = k;
      k = 0;
      i = q;
      return k | 0;
    }
    if ((b << 24) >> 24 == (k << 24) >> 24) {
      j = a[l >> 0] | 0;
      if (!(j & 1)) j = (j & 255) >>> 1;
      else j = c[(l + 4) >> 2] | 0;
      if (j) {
        if (!(a[e >> 0] | 0)) {
          k = -1;
          i = q;
          return k | 0;
        }
        h = c[n >> 2] | 0;
        if (((h - m) | 0) >= 160) {
          k = 0;
          i = q;
          return k | 0;
        }
        k = c[o >> 2] | 0;
        c[n >> 2] = h + 4;
        c[h >> 2] = k;
        c[o >> 2] = 0;
        k = 0;
        i = q;
        return k | 0;
      }
    }
    j = (p + 32) | 0;
    k = p;
    do {
      if ((a[k >> 0] | 0) == (b << 24) >> 24) {
        j = k;
        break;
      }
      k = (k + 1) | 0;
    } while ((k | 0) != (j | 0));
    b = (j - p) | 0;
    if ((b | 0) > 31) {
      k = -1;
      i = q;
      return k | 0;
    }
    p = a[(17600 + b) >> 0] | 0;
    if (((b | 0) == 23) | ((b | 0) == 22)) {
      a[f >> 0] = 80;
      k = c[h >> 2] | 0;
      c[h >> 2] = k + 1;
      a[k >> 0] = p;
      k = 0;
      i = q;
      return k | 0;
    } else if (((b | 0) == 24) | ((b | 0) == 25)) {
      o = c[h >> 2] | 0;
      if ((o | 0) != (g | 0) ? ((d[(o + -1) >> 0] & 95) | 0) != ((d[f >> 0] & 127) | 0) : 0) {
        k = -1;
        i = q;
        return k | 0;
      }
      c[h >> 2] = o + 1;
      a[o >> 0] = p;
      k = 0;
      i = q;
      return k | 0;
    } else {
      g = p & 95;
      if ((g | 0) == (a[f >> 0] | 0) ? ((a[f >> 0] = g | 128), (a[e >> 0] | 0) != 0) : 0) {
        a[e >> 0] = 0;
        f = a[l >> 0] | 0;
        if (!(f & 1)) l = (f & 255) >>> 1;
        else l = c[(l + 4) >> 2] | 0;
        if ((l | 0) != 0 ? ((r = c[n >> 2] | 0), ((r - m) | 0) < 160) : 0) {
          k = c[o >> 2] | 0;
          c[n >> 2] = r + 4;
          c[r >> 2] = k;
        }
      }
      k = c[h >> 2] | 0;
      c[h >> 2] = k + 1;
      a[k >> 0] = p;
      if ((b | 0) > 21) {
        k = 0;
        i = q;
        return k | 0;
      }
      c[o >> 2] = (c[o >> 2] | 0) + 1;
      k = 0;
      i = q;
      return k | 0;
    }
    return 0;
  }
  function Wk(a, b, d, e) {
    a = a | 0;
    b = b | 0;
    d = d | 0;
    e = e | 0;
    var f = 0,
      g = 0;
    f = i;
    b = c[(b + 28) >> 2] | 0;
    g = (b + 4) | 0;
    c[g >> 2] = (c[g >> 2] | 0) + 1;
    g = Sn(b, 19064) | 0;
    sd[c[((c[g >> 2] | 0) + 48) >> 2] & 7](g, 17600, 17626 | 0, d) | 0;
    d = Sn(b, 19224) | 0;
    c[e >> 2] = md[c[((c[d >> 2] | 0) + 16) >> 2] & 127](d) | 0;
    kd[c[((c[d >> 2] | 0) + 20) >> 2] & 63](a, d);
    e = (b + 4) | 0;
    d = c[e >> 2] | 0;
    c[e >> 2] = d + -1;
    if (d) {
      i = f;
      return;
    }
    jd[c[((c[b >> 2] | 0) + 8) >> 2] & 255](b);
    i = f;
    return;
  }
  function Xk(a, b, d, e, f) {
    a = a | 0;
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    var g = 0,
      h = 0;
    g = i;
    b = c[(b + 28) >> 2] | 0;
    h = (b + 4) | 0;
    c[h >> 2] = (c[h >> 2] | 0) + 1;
    h = Sn(b, 19064) | 0;
    sd[c[((c[h >> 2] | 0) + 48) >> 2] & 7](h, 17600, 17632 | 0, d) | 0;
    d = Sn(b, 19224) | 0;
    c[e >> 2] = md[c[((c[d >> 2] | 0) + 12) >> 2] & 127](d) | 0;
    c[f >> 2] = md[c[((c[d >> 2] | 0) + 16) >> 2] & 127](d) | 0;
    kd[c[((c[d >> 2] | 0) + 20) >> 2] & 63](a, d);
    e = (b + 4) | 0;
    d = c[e >> 2] | 0;
    c[e >> 2] = d + -1;
    if (d) {
      i = g;
      return;
    }
    jd[c[((c[b >> 2] | 0) + 8) >> 2] & 255](b);
    i = g;
    return;
  }
  function Yk(b, e, f, g, h, j, k, l, m, n, o, p) {
    b = b | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    k = k | 0;
    l = l | 0;
    m = m | 0;
    n = n | 0;
    o = o | 0;
    p = p | 0;
    var q = 0,
      r = 0;
    q = i;
    if ((b | 0) == (j | 0)) {
      if (!(a[e >> 0] | 0)) {
        k = -1;
        i = q;
        return k | 0;
      }
      a[e >> 0] = 0;
      k = c[h >> 2] | 0;
      c[h >> 2] = k + 1;
      a[k >> 0] = 46;
      h = a[l >> 0] | 0;
      if (!(h & 1)) h = (h & 255) >>> 1;
      else h = c[(l + 4) >> 2] | 0;
      if (!h) {
        k = 0;
        i = q;
        return k | 0;
      }
      h = c[n >> 2] | 0;
      if (((h - m) | 0) >= 160) {
        k = 0;
        i = q;
        return k | 0;
      }
      k = c[o >> 2] | 0;
      c[n >> 2] = h + 4;
      c[h >> 2] = k;
      k = 0;
      i = q;
      return k | 0;
    }
    if ((b | 0) == (k | 0)) {
      j = a[l >> 0] | 0;
      if (!(j & 1)) j = (j & 255) >>> 1;
      else j = c[(l + 4) >> 2] | 0;
      if (j) {
        if (!(a[e >> 0] | 0)) {
          k = -1;
          i = q;
          return k | 0;
        }
        h = c[n >> 2] | 0;
        if (((h - m) | 0) >= 160) {
          k = 0;
          i = q;
          return k | 0;
        }
        k = c[o >> 2] | 0;
        c[n >> 2] = h + 4;
        c[h >> 2] = k;
        c[o >> 2] = 0;
        k = 0;
        i = q;
        return k | 0;
      }
    }
    j = (p + 128) | 0;
    k = p;
    do {
      if ((c[k >> 2] | 0) == (b | 0)) {
        j = k;
        break;
      }
      k = (k + 4) | 0;
    } while ((k | 0) != (j | 0));
    b = (j - p) | 0;
    j = b >> 2;
    if ((b | 0) > 124) {
      k = -1;
      i = q;
      return k | 0;
    }
    p = a[(17600 + j) >> 0] | 0;
    if (((j | 0) == 23) | ((j | 0) == 22)) a[f >> 0] = 80;
    else if (!(((j | 0) == 24) | ((j | 0) == 25))) {
      g = p & 95;
      if ((g | 0) == (a[f >> 0] | 0) ? ((a[f >> 0] = g | 128), (a[e >> 0] | 0) != 0) : 0) {
        a[e >> 0] = 0;
        f = a[l >> 0] | 0;
        if (!(f & 1)) l = (f & 255) >>> 1;
        else l = c[(l + 4) >> 2] | 0;
        if ((l | 0) != 0 ? ((r = c[n >> 2] | 0), ((r - m) | 0) < 160) : 0) {
          k = c[o >> 2] | 0;
          c[n >> 2] = r + 4;
          c[r >> 2] = k;
        }
      }
    } else {
      o = c[h >> 2] | 0;
      if ((o | 0) != (g | 0) ? ((d[(o + -1) >> 0] & 95) | 0) != ((d[f >> 0] & 127) | 0) : 0) {
        k = -1;
        i = q;
        return k | 0;
      }
      c[h >> 2] = o + 1;
      a[o >> 0] = p;
      k = 0;
      i = q;
      return k | 0;
    }
    k = c[h >> 2] | 0;
    c[h >> 2] = k + 1;
    a[k >> 0] = p;
    if ((b | 0) > 84) {
      k = 0;
      i = q;
      return k | 0;
    }
    c[o >> 2] = (c[o >> 2] | 0) + 1;
    k = 0;
    i = q;
    return k | 0;
  }
  function Zk(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function _k(a) {
    a = a | 0;
    return;
  }
  function $k(b, d, e, f, g, h) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    var j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0;
    j = i;
    i = (i + 32) | 0;
    l = (j + 16) | 0;
    m = (j + 12) | 0;
    k = j;
    if (!(c[(f + 4) >> 2] & 1)) {
      n = c[((c[d >> 2] | 0) + 24) >> 2] | 0;
      c[m >> 2] = c[e >> 2];
      o = h & 1;
      c[(l + 0) >> 2] = c[(m + 0) >> 2];
      ud[n & 31](b, d, l, f, g, o);
      i = j;
      return;
    }
    l = c[(f + 28) >> 2] | 0;
    d = (l + 4) | 0;
    c[d >> 2] = (c[d >> 2] | 0) + 1;
    d = Sn(l, 19216) | 0;
    n = (l + 4) | 0;
    o = c[n >> 2] | 0;
    c[n >> 2] = o + -1;
    if (!o) jd[c[((c[l >> 2] | 0) + 8) >> 2] & 255](l);
    l = c[d >> 2] | 0;
    if (h) kd[c[(l + 24) >> 2] & 63](k, d);
    else kd[c[(l + 28) >> 2] & 63](k, d);
    g = a[k >> 0] | 0;
    if (!(g & 1)) {
      h = (k + 1) | 0;
      m = h;
      d = (k + 8) | 0;
    } else {
      d = (k + 8) | 0;
      m = c[d >> 2] | 0;
      h = (k + 1) | 0;
    }
    l = (k + 4) | 0;
    while (1) {
      f = (g & 1) == 0;
      if (f) {
        n = h;
        g = (g & 255) >>> 1;
      } else {
        n = c[d >> 2] | 0;
        g = c[l >> 2] | 0;
      }
      if ((m | 0) == ((n + g) | 0)) break;
      n = a[m >> 0] | 0;
      f = c[e >> 2] | 0;
      do
        if (f) {
          o = (f + 24) | 0;
          g = c[o >> 2] | 0;
          if ((g | 0) != (c[(f + 28) >> 2] | 0)) {
            c[o >> 2] = g + 1;
            a[g >> 0] = n;
            break;
          }
          if ((vd[c[((c[f >> 2] | 0) + 52) >> 2] & 63](f, n & 255) | 0) == -1) c[e >> 2] = 0;
        }
      while (0);
      g = a[k >> 0] | 0;
      m = (m + 1) | 0;
    }
    c[b >> 2] = c[e >> 2];
    if (f) {
      i = j;
      return;
    }
    Uq(c[(k + 8) >> 2] | 0);
    i = j;
    return;
  }
  function al(b, d, e, f, g, h) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    var j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0;
    l = i;
    i = (i + 64) | 0;
    p = l;
    r = (l + 16) | 0;
    n = (l + 24) | 0;
    d = (l + 36) | 0;
    m = (l + 8) | 0;
    k = (l + 4) | 0;
    o = (l + 12) | 0;
    a[(r + 0) >> 0] = a[17880] | 0;
    a[(r + 1) >> 0] = a[17881] | 0;
    a[(r + 2) >> 0] = a[17882] | 0;
    a[(r + 3) >> 0] = a[17883] | 0;
    a[(r + 4) >> 0] = a[17884] | 0;
    a[(r + 5) >> 0] = a[17885] | 0;
    q = (f + 4) | 0;
    bl((r + 1) | 0, 17784, 1, c[q >> 2] | 0);
    s = Dk() | 0;
    c[p >> 2] = h;
    p = cl(n, 12, s, r, p) | 0;
    h = (n + p) | 0;
    q = c[q >> 2] & 176;
    do
      if ((q | 0) == 16) {
        q = a[n >> 0] | 0;
        if (((q << 24) >> 24 == 43) | ((q << 24) >> 24 == 45)) {
          p = (n + 1) | 0;
          break;
        }
        if (
          ((p | 0) > 1) & ((q << 24) >> 24 == 48)
            ? ((s = a[(n + 1) >> 0] | 0), ((s << 24) >> 24 == 88) | ((s << 24) >> 24 == 120))
            : 0
        )
          p = (n + 2) | 0;
        else j = 7;
      } else if ((q | 0) == 32) p = h;
      else j = 7;
    while (0);
    if ((j | 0) == 7) p = n;
    j = c[(f + 28) >> 2] | 0;
    c[o >> 2] = j;
    j = (j + 4) | 0;
    c[j >> 2] = (c[j >> 2] | 0) + 1;
    dl(n, p, h, d, m, k, o);
    j = c[o >> 2] | 0;
    r = (j + 4) | 0;
    s = c[r >> 2] | 0;
    c[r >> 2] = s + -1;
    if (s) {
      q = c[e >> 2] | 0;
      r = c[m >> 2] | 0;
      s = c[k >> 2] | 0;
      Sg(b, q, d, r, s, f, g);
      i = l;
      return;
    }
    jd[c[((c[j >> 2] | 0) + 8) >> 2] & 255](j);
    q = c[e >> 2] | 0;
    r = c[m >> 2] | 0;
    s = c[k >> 2] | 0;
    Sg(b, q, d, r, s, f, g);
    i = l;
    return;
  }
  function bl(b, c, d, e) {
    b = b | 0;
    c = c | 0;
    d = d | 0;
    e = e | 0;
    var f = 0,
      g = 0,
      h = 0;
    f = i;
    if (e & 2048) {
      a[b >> 0] = 43;
      b = (b + 1) | 0;
    }
    if (e & 512) {
      a[b >> 0] = 35;
      b = (b + 1) | 0;
    }
    g = a[c >> 0] | 0;
    if ((g << 24) >> 24)
      while (1) {
        c = (c + 1) | 0;
        h = (b + 1) | 0;
        a[b >> 0] = g;
        g = a[c >> 0] | 0;
        if (!((g << 24) >> 24)) {
          b = h;
          break;
        } else b = h;
      }
    c = e & 74;
    if ((c | 0) == 64) {
      a[b >> 0] = 111;
      i = f;
      return;
    } else if ((c | 0) == 8)
      if (!(e & 16384)) {
        a[b >> 0] = 120;
        i = f;
        return;
      } else {
        a[b >> 0] = 88;
        i = f;
        return;
      }
    else if (d) {
      a[b >> 0] = 100;
      i = f;
      return;
    } else {
      a[b >> 0] = 117;
      i = f;
      return;
    }
  }
  function cl(a, b, d, e, f) {
    a = a | 0;
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    var g = 0,
      h = 0;
    g = i;
    i = (i + 16) | 0;
    h = g;
    c[h >> 2] = f;
    d = Yb(d | 0) | 0;
    e = fr(a, b, e, h) | 0;
    if (!d) {
      i = g;
      return e | 0;
    }
    Yb(d | 0) | 0;
    i = g;
    return e | 0;
  }
  function dl(b, d, e, f, g, h, j) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    var k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0;
    l = i;
    i = (i + 16) | 0;
    k = l;
    n = Sn(c[j >> 2] | 0, 19072) | 0;
    o = Sn(c[j >> 2] | 0, 19216) | 0;
    kd[c[((c[o >> 2] | 0) + 20) >> 2] & 63](k, o);
    j = a[k >> 0] | 0;
    if (!(j & 1)) j = (j & 255) >>> 1;
    else j = c[(k + 4) >> 2] | 0;
    if (j) {
      c[h >> 2] = f;
      j = a[b >> 0] | 0;
      if (((j << 24) >> 24 == 43) | ((j << 24) >> 24 == 45)) {
        v = vd[c[((c[n >> 2] | 0) + 28) >> 2] & 63](n, j) | 0;
        j = c[h >> 2] | 0;
        c[h >> 2] = j + 1;
        a[j >> 0] = v;
        j = (b + 1) | 0;
      } else j = b;
      if (
        (((e - j) | 0) > 1
        ? (a[j >> 0] | 0) == 48
        : 0)
          ? ((q = (j + 1) | 0),
            (v = a[q >> 0] | 0),
            ((v << 24) >> 24 == 88) | ((v << 24) >> 24 == 120))
          : 0
      ) {
        v = vd[c[((c[n >> 2] | 0) + 28) >> 2] & 63](n, 48) | 0;
        u = c[h >> 2] | 0;
        c[h >> 2] = u + 1;
        a[u >> 0] = v;
        u = vd[c[((c[n >> 2] | 0) + 28) >> 2] & 63](n, a[q >> 0] | 0) | 0;
        v = c[h >> 2] | 0;
        c[h >> 2] = v + 1;
        a[v >> 0] = u;
        j = (j + 2) | 0;
      }
      if ((j | 0) != (e | 0) ? ((p = (e + -1) | 0), p >>> 0 > j >>> 0) : 0) {
        q = j;
        do {
          v = a[q >> 0] | 0;
          a[q >> 0] = a[p >> 0] | 0;
          a[p >> 0] = v;
          q = (q + 1) | 0;
          p = (p + -1) | 0;
        } while (q >>> 0 < p >>> 0);
      }
      s = md[c[((c[o >> 2] | 0) + 16) >> 2] & 127](o) | 0;
      if (j >>> 0 < e >>> 0) {
        o = (k + 1) | 0;
        r = (k + 4) | 0;
        p = (k + 8) | 0;
        u = 0;
        t = 0;
        q = j;
        while (1) {
          v = a[(((a[k >> 0] & 1) == 0 ? o : c[p >> 2] | 0) + t) >> 0] | 0;
          if (((v << 24) >> 24 != 0) & ((u | 0) == (((v << 24) >> 24) | 0))) {
            u = c[h >> 2] | 0;
            c[h >> 2] = u + 1;
            a[u >> 0] = s;
            u = a[k >> 0] | 0;
            if (!(u & 1)) v = (u & 255) >>> 1;
            else v = c[r >> 2] | 0;
            u = 0;
            t = (((t >>> 0 < ((v + -1) | 0) >>> 0) & 1) + t) | 0;
          }
          w = vd[c[((c[n >> 2] | 0) + 28) >> 2] & 63](n, a[q >> 0] | 0) | 0;
          v = c[h >> 2] | 0;
          c[h >> 2] = v + 1;
          a[v >> 0] = w;
          q = (q + 1) | 0;
          if (q >>> 0 >= e >>> 0) break;
          else u = (u + 1) | 0;
        }
      }
      j = (f + (j - b)) | 0;
      n = c[h >> 2] | 0;
      if ((j | 0) != (n | 0) ? ((m = (n + -1) | 0), m >>> 0 > j >>> 0) : 0)
        do {
          w = a[j >> 0] | 0;
          a[j >> 0] = a[m >> 0] | 0;
          a[m >> 0] = w;
          j = (j + 1) | 0;
          m = (m + -1) | 0;
        } while (j >>> 0 < m >>> 0);
    } else {
      sd[c[((c[n >> 2] | 0) + 32) >> 2] & 7](n, b, e, f) | 0;
      c[h >> 2] = f + (e - b);
    }
    if ((d | 0) == (e | 0)) f = c[h >> 2] | 0;
    else f = (f + (d - b)) | 0;
    c[g >> 2] = f;
    if (!(a[k >> 0] & 1)) {
      i = l;
      return;
    }
    Uq(c[(k + 8) >> 2] | 0);
    i = l;
    return;
  }
  function el(b, d, e, f, g, h, j) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    var k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0;
    k = i;
    i = (i + 96) | 0;
    m = (k + 8) | 0;
    r = k;
    p = (k + 64) | 0;
    n = (k + 60) | 0;
    d = (k + 56) | 0;
    o = (k + 52) | 0;
    q = r;
    c[q >> 2] = 37;
    c[(q + 4) >> 2] = 0;
    q = (f + 4) | 0;
    bl((r + 1) | 0, 17792, 1, c[q >> 2] | 0);
    s = Dk() | 0;
    t = m;
    c[t >> 2] = h;
    c[(t + 4) >> 2] = j;
    h = cl(p, 22, s, r, m) | 0;
    j = (p + h) | 0;
    q = c[q >> 2] & 176;
    do
      if ((q | 0) == 32) h = j;
      else if ((q | 0) == 16) {
        q = a[p >> 0] | 0;
        if (((q << 24) >> 24 == 43) | ((q << 24) >> 24 == 45)) {
          h = (p + 1) | 0;
          break;
        }
        if (
          ((h | 0) > 1) & ((q << 24) >> 24 == 48)
            ? ((t = a[(p + 1) >> 0] | 0), ((t << 24) >> 24 == 88) | ((t << 24) >> 24 == 120))
            : 0
        )
          h = (p + 2) | 0;
        else l = 7;
      } else l = 7;
    while (0);
    if ((l | 0) == 7) h = p;
    l = c[(f + 28) >> 2] | 0;
    c[o >> 2] = l;
    l = (l + 4) | 0;
    c[l >> 2] = (c[l >> 2] | 0) + 1;
    dl(p, h, j, m, n, d, o);
    l = c[o >> 2] | 0;
    s = (l + 4) | 0;
    t = c[s >> 2] | 0;
    c[s >> 2] = t + -1;
    if (t) {
      r = c[e >> 2] | 0;
      s = c[n >> 2] | 0;
      t = c[d >> 2] | 0;
      Sg(b, r, m, s, t, f, g);
      i = k;
      return;
    }
    jd[c[((c[l >> 2] | 0) + 8) >> 2] & 255](l);
    r = c[e >> 2] | 0;
    s = c[n >> 2] | 0;
    t = c[d >> 2] | 0;
    Sg(b, r, m, s, t, f, g);
    i = k;
    return;
  }
  function fl(b, d, e, f, g, h) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    var j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0;
    l = i;
    i = (i + 64) | 0;
    p = l;
    r = (l + 16) | 0;
    n = (l + 24) | 0;
    d = (l + 36) | 0;
    m = (l + 8) | 0;
    k = (l + 4) | 0;
    o = (l + 12) | 0;
    a[(r + 0) >> 0] = a[17880] | 0;
    a[(r + 1) >> 0] = a[17881] | 0;
    a[(r + 2) >> 0] = a[17882] | 0;
    a[(r + 3) >> 0] = a[17883] | 0;
    a[(r + 4) >> 0] = a[17884] | 0;
    a[(r + 5) >> 0] = a[17885] | 0;
    q = (f + 4) | 0;
    bl((r + 1) | 0, 17784, 0, c[q >> 2] | 0);
    s = Dk() | 0;
    c[p >> 2] = h;
    p = cl(n, 12, s, r, p) | 0;
    h = (n + p) | 0;
    q = c[q >> 2] & 176;
    do
      if ((q | 0) == 16) {
        q = a[n >> 0] | 0;
        if (((q << 24) >> 24 == 43) | ((q << 24) >> 24 == 45)) {
          p = (n + 1) | 0;
          break;
        }
        if (
          ((p | 0) > 1) & ((q << 24) >> 24 == 48)
            ? ((s = a[(n + 1) >> 0] | 0), ((s << 24) >> 24 == 88) | ((s << 24) >> 24 == 120))
            : 0
        )
          p = (n + 2) | 0;
        else j = 7;
      } else if ((q | 0) == 32) p = h;
      else j = 7;
    while (0);
    if ((j | 0) == 7) p = n;
    j = c[(f + 28) >> 2] | 0;
    c[o >> 2] = j;
    j = (j + 4) | 0;
    c[j >> 2] = (c[j >> 2] | 0) + 1;
    dl(n, p, h, d, m, k, o);
    j = c[o >> 2] | 0;
    r = (j + 4) | 0;
    s = c[r >> 2] | 0;
    c[r >> 2] = s + -1;
    if (s) {
      q = c[e >> 2] | 0;
      r = c[m >> 2] | 0;
      s = c[k >> 2] | 0;
      Sg(b, q, d, r, s, f, g);
      i = l;
      return;
    }
    jd[c[((c[j >> 2] | 0) + 8) >> 2] & 255](j);
    q = c[e >> 2] | 0;
    r = c[m >> 2] | 0;
    s = c[k >> 2] | 0;
    Sg(b, q, d, r, s, f, g);
    i = l;
    return;
  }
  function gl(b, d, e, f, g, h, j) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    var k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0;
    k = i;
    i = (i + 96) | 0;
    m = (k + 8) | 0;
    r = k;
    p = (k + 64) | 0;
    n = (k + 60) | 0;
    d = (k + 56) | 0;
    o = (k + 52) | 0;
    q = r;
    c[q >> 2] = 37;
    c[(q + 4) >> 2] = 0;
    q = (f + 4) | 0;
    bl((r + 1) | 0, 17792, 0, c[q >> 2] | 0);
    s = Dk() | 0;
    t = m;
    c[t >> 2] = h;
    c[(t + 4) >> 2] = j;
    h = cl(p, 23, s, r, m) | 0;
    j = (p + h) | 0;
    q = c[q >> 2] & 176;
    do
      if ((q | 0) == 32) h = j;
      else if ((q | 0) == 16) {
        q = a[p >> 0] | 0;
        if (((q << 24) >> 24 == 43) | ((q << 24) >> 24 == 45)) {
          h = (p + 1) | 0;
          break;
        }
        if (
          ((h | 0) > 1) & ((q << 24) >> 24 == 48)
            ? ((t = a[(p + 1) >> 0] | 0), ((t << 24) >> 24 == 88) | ((t << 24) >> 24 == 120))
            : 0
        )
          h = (p + 2) | 0;
        else l = 7;
      } else l = 7;
    while (0);
    if ((l | 0) == 7) h = p;
    l = c[(f + 28) >> 2] | 0;
    c[o >> 2] = l;
    l = (l + 4) | 0;
    c[l >> 2] = (c[l >> 2] | 0) + 1;
    dl(p, h, j, m, n, d, o);
    l = c[o >> 2] | 0;
    s = (l + 4) | 0;
    t = c[s >> 2] | 0;
    c[s >> 2] = t + -1;
    if (t) {
      r = c[e >> 2] | 0;
      s = c[n >> 2] | 0;
      t = c[d >> 2] | 0;
      Sg(b, r, m, s, t, f, g);
      i = k;
      return;
    }
    jd[c[((c[l >> 2] | 0) + 8) >> 2] & 255](l);
    r = c[e >> 2] | 0;
    s = c[n >> 2] | 0;
    t = c[d >> 2] | 0;
    Sg(b, r, m, s, t, f, g);
    i = k;
    return;
  }
  function hl(b, d, e, f, g, j) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    j = +j;
    var l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0;
    m = i;
    i = (i + 128) | 0;
    p = m;
    u = (m + 64) | 0;
    r = (m + 92) | 0;
    s = (m + 80) | 0;
    l = (m + 76) | 0;
    d = (m + 72) | 0;
    o = (m + 84) | 0;
    n = (m + 88) | 0;
    t = u;
    c[t >> 2] = 37;
    c[(t + 4) >> 2] = 0;
    t = (f + 4) | 0;
    v = il((u + 1) | 0, 17800, c[t >> 2] | 0) | 0;
    c[s >> 2] = r;
    w = Dk() | 0;
    if (v) {
      c[p >> 2] = c[(f + 8) >> 2];
      x = (p + 4) | 0;
      h[k >> 3] = j;
      c[x >> 2] = c[k >> 2];
      c[(x + 4) >> 2] = c[(k + 4) >> 2];
      w = cl(r, 30, w, u, p) | 0;
    } else {
      h[k >> 3] = j;
      c[p >> 2] = c[k >> 2];
      c[(p + 4) >> 2] = c[(k + 4) >> 2];
      w = cl(r, 30, w, u, p) | 0;
    }
    if ((w | 0) > 29) {
      if (v) {
        w = Dk() | 0;
        c[p >> 2] = c[(f + 8) >> 2];
        x = (p + 4) | 0;
        h[k >> 3] = j;
        c[x >> 2] = c[k >> 2];
        c[(x + 4) >> 2] = c[(k + 4) >> 2];
        w = jl(s, w, u, p) | 0;
      } else {
        w = Dk() | 0;
        c[p >> 2] = c[(f + 8) >> 2];
        x = (p + 4) | 0;
        h[k >> 3] = j;
        c[x >> 2] = c[k >> 2];
        c[(x + 4) >> 2] = c[(k + 4) >> 2];
        w = jl(s, w, u, p) | 0;
      }
      s = c[s >> 2] | 0;
      if (!s) {
        x = Wb(4) | 0;
        c[x >> 2] = 27280;
        Zc(x | 0, 27328, 220);
      } else u = s;
    } else {
      u = r;
      s = 0;
    }
    v = (u + w) | 0;
    t = c[t >> 2] & 176;
    do
      if ((t | 0) == 32) t = v;
      else if ((t | 0) == 16) {
        t = a[u >> 0] | 0;
        if (((t << 24) >> 24 == 43) | ((t << 24) >> 24 == 45)) {
          t = (u + 1) | 0;
          break;
        }
        if (
          ((w | 0) > 1) & ((t << 24) >> 24 == 48)
            ? ((x = a[(u + 1) >> 0] | 0), ((x << 24) >> 24 == 88) | ((x << 24) >> 24 == 120))
            : 0
        )
          t = (u + 2) | 0;
        else q = 19;
      } else q = 19;
    while (0);
    if ((q | 0) == 19) t = u;
    if ((u | 0) != (r | 0)) {
      p = Tq(w << 1) | 0;
      if (!p) {
        x = Wb(4) | 0;
        c[x >> 2] = 27280;
        Zc(x | 0, 27328, 220);
      } else {
        r = u;
        q = p;
      }
    } else q = 0;
    w = c[(f + 28) >> 2] | 0;
    c[o >> 2] = w;
    w = (w + 4) | 0;
    c[w >> 2] = (c[w >> 2] | 0) + 1;
    kl(r, t, v, p, l, d, o);
    o = c[o >> 2] | 0;
    w = (o + 4) | 0;
    x = c[w >> 2] | 0;
    c[w >> 2] = x + -1;
    if (!x) jd[c[((c[o >> 2] | 0) + 8) >> 2] & 255](o);
    Sg(n, c[e >> 2] | 0, p, c[l >> 2] | 0, c[d >> 2] | 0, f, g);
    x = c[n >> 2] | 0;
    c[e >> 2] = x;
    c[b >> 2] = x;
    if (q) Uq(q);
    if (!s) {
      i = m;
      return;
    }
    Uq(s);
    i = m;
    return;
  }
  function il(b, c, d) {
    b = b | 0;
    c = c | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0;
    e = i;
    if (d & 2048) {
      a[b >> 0] = 43;
      b = (b + 1) | 0;
    }
    if (d & 1024) {
      a[b >> 0] = 35;
      b = (b + 1) | 0;
    }
    f = d & 260;
    h = d >>> 14;
    d = (f | 0) == 260;
    if (d) g = 0;
    else {
      a[b >> 0] = 46;
      a[(b + 1) >> 0] = 42;
      b = (b + 2) | 0;
      g = 1;
    }
    j = a[c >> 0] | 0;
    if ((j << 24) >> 24)
      while (1) {
        c = (c + 1) | 0;
        k = (b + 1) | 0;
        a[b >> 0] = j;
        j = a[c >> 0] | 0;
        if (!((j << 24) >> 24)) {
          b = k;
          break;
        } else b = k;
      }
    do
      if ((f | 0) == 256)
        if (!(h & 1)) {
          a[b >> 0] = 101;
          break;
        } else {
          a[b >> 0] = 69;
          break;
        }
      else if ((f | 0) == 4)
        if (!(h & 1)) {
          a[b >> 0] = 102;
          break;
        } else {
          a[b >> 0] = 70;
          break;
        }
      else {
        f = ((h & 1) | 0) != 0;
        if (d)
          if (f) {
            a[b >> 0] = 65;
            break;
          } else {
            a[b >> 0] = 97;
            break;
          }
        else if (f) {
          a[b >> 0] = 71;
          break;
        } else {
          a[b >> 0] = 103;
          break;
        }
      }
    while (0);
    i = e;
    return g | 0;
  }
  function jl(a, b, d, e) {
    a = a | 0;
    b = b | 0;
    d = d | 0;
    e = e | 0;
    var f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0;
    f = i;
    i = (i + 32) | 0;
    k = (f + 16) | 0;
    j = f;
    c[j >> 2] = e;
    b = Yb(b | 0) | 0;
    e = Tq(240) | 0;
    do
      if (e) {
        c[k >> 2] = c[j >> 2];
        k = fr(e, 240, d, k) | 0;
        if (k >>> 0 < 240) {
          j = Vq(e, (k + 1) | 0) | 0;
          c[a >> 2] = (j | 0) != 0 ? j : e;
          break;
        }
        Uq(e);
        if ((k | 0) >= 0 ? ((g = (k + 1) | 0), (h = Tq(g) | 0), (c[a >> 2] = h), (h | 0) != 0) : 0)
          k = fr(h, g, d, j) | 0;
        else k = -1;
      } else k = -1;
    while (0);
    if (!b) {
      i = f;
      return k | 0;
    }
    Yb(b | 0) | 0;
    i = f;
    return k | 0;
  }
  function kl(b, d, e, f, g, h, j) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    var k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0,
      y = 0,
      z = 0;
    k = i;
    i = (i + 16) | 0;
    l = k;
    m = Sn(c[j >> 2] | 0, 19072) | 0;
    j = Sn(c[j >> 2] | 0, 19216) | 0;
    kd[c[((c[j >> 2] | 0) + 20) >> 2] & 63](l, j);
    c[h >> 2] = f;
    n = a[b >> 0] | 0;
    if (((n << 24) >> 24 == 43) | ((n << 24) >> 24 == 45)) {
      y = vd[c[((c[m >> 2] | 0) + 28) >> 2] & 63](m, n) | 0;
      t = c[h >> 2] | 0;
      c[h >> 2] = t + 1;
      a[t >> 0] = y;
      t = (b + 1) | 0;
    } else t = b;
    n = e;
    a: do
      if (
        (((n - t) | 0) > 1
        ? (a[t >> 0] | 0) == 48
        : 0)
          ? ((p = (t + 1) | 0),
            (y = a[p >> 0] | 0),
            ((y << 24) >> 24 == 88) | ((y << 24) >> 24 == 120))
          : 0
      ) {
        y = vd[c[((c[m >> 2] | 0) + 28) >> 2] & 63](m, 48) | 0;
        x = c[h >> 2] | 0;
        c[h >> 2] = x + 1;
        a[x >> 0] = y;
        t = (t + 2) | 0;
        x = vd[c[((c[m >> 2] | 0) + 28) >> 2] & 63](m, a[p >> 0] | 0) | 0;
        y = c[h >> 2] | 0;
        c[h >> 2] = y + 1;
        a[y >> 0] = x;
        if (t >>> 0 < e >>> 0) {
          q = t;
          while (1) {
            y = a[q >> 0] | 0;
            Dk() | 0;
            y = (y << 24) >> 24;
            if (((y + -48) | 0) >>> 0 >= 10 ? (((y | 32) + -97) | 0) >>> 0 >= 6 : 0) {
              p = t;
              break a;
            }
            q = (q + 1) | 0;
            if (q >>> 0 >= e >>> 0) {
              p = t;
              break;
            }
          }
        } else {
          p = t;
          q = t;
        }
      } else s = 5;
    while (0);
    b: do
      if ((s | 0) == 5)
        if (t >>> 0 < e >>> 0) {
          q = t;
          while (1) {
            y = a[q >> 0] | 0;
            Dk() | 0;
            s = (q + 1) | 0;
            if (((((y << 24) >> 24) + -48) | 0) >>> 0 >= 10) {
              p = t;
              break b;
            }
            if (s >>> 0 < e >>> 0) q = s;
            else {
              p = t;
              q = s;
              break;
            }
          }
        } else {
          p = t;
          q = t;
        }
    while (0);
    s = a[l >> 0] | 0;
    if (!(s & 1)) s = (s & 255) >>> 1;
    else s = c[(l + 4) >> 2] | 0;
    if (s) {
      if ((p | 0) != (q | 0) ? ((r = (q + -1) | 0), r >>> 0 > p >>> 0) : 0) {
        s = p;
        do {
          y = a[s >> 0] | 0;
          a[s >> 0] = a[r >> 0] | 0;
          a[r >> 0] = y;
          s = (s + 1) | 0;
          r = (r + -1) | 0;
        } while (s >>> 0 < r >>> 0);
      }
      u = md[c[((c[j >> 2] | 0) + 16) >> 2] & 127](j) | 0;
      if (p >>> 0 < q >>> 0) {
        r = (l + 1) | 0;
        s = (l + 4) | 0;
        t = (l + 8) | 0;
        x = 0;
        w = 0;
        v = p;
        while (1) {
          y = a[(((a[l >> 0] & 1) == 0 ? r : c[t >> 2] | 0) + w) >> 0] | 0;
          if (((y << 24) >> 24 > 0) & ((x | 0) == (((y << 24) >> 24) | 0))) {
            x = c[h >> 2] | 0;
            c[h >> 2] = x + 1;
            a[x >> 0] = u;
            x = a[l >> 0] | 0;
            if (!(x & 1)) y = (x & 255) >>> 1;
            else y = c[s >> 2] | 0;
            x = 0;
            w = (((w >>> 0 < ((y + -1) | 0) >>> 0) & 1) + w) | 0;
          }
          z = vd[c[((c[m >> 2] | 0) + 28) >> 2] & 63](m, a[v >> 0] | 0) | 0;
          y = c[h >> 2] | 0;
          c[h >> 2] = y + 1;
          a[y >> 0] = z;
          v = (v + 1) | 0;
          if (v >>> 0 >= q >>> 0) break;
          else x = (x + 1) | 0;
        }
      }
      r = (f + (p - b)) | 0;
      p = c[h >> 2] | 0;
      if ((r | 0) != (p | 0) ? ((o = (p + -1) | 0), o >>> 0 > r >>> 0) : 0)
        do {
          z = a[r >> 0] | 0;
          a[r >> 0] = a[o >> 0] | 0;
          a[o >> 0] = z;
          r = (r + 1) | 0;
          o = (o + -1) | 0;
        } while (r >>> 0 < o >>> 0);
    } else {
      sd[c[((c[m >> 2] | 0) + 32) >> 2] & 7](m, p, q, c[h >> 2] | 0) | 0;
      c[h >> 2] = (c[h >> 2] | 0) + (q - p);
    }
    c: do
      if (q >>> 0 < e >>> 0) {
        while (1) {
          o = a[q >> 0] | 0;
          if ((o << 24) >> 24 == 46) break;
          y = vd[c[((c[m >> 2] | 0) + 28) >> 2] & 63](m, o) | 0;
          z = c[h >> 2] | 0;
          c[h >> 2] = z + 1;
          a[z >> 0] = y;
          q = (q + 1) | 0;
          if (q >>> 0 >= e >>> 0) break c;
        }
        y = md[c[((c[j >> 2] | 0) + 12) >> 2] & 127](j) | 0;
        z = c[h >> 2] | 0;
        c[h >> 2] = z + 1;
        a[z >> 0] = y;
        q = (q + 1) | 0;
      }
    while (0);
    sd[c[((c[m >> 2] | 0) + 32) >> 2] & 7](m, q, e, c[h >> 2] | 0) | 0;
    m = ((c[h >> 2] | 0) + (n - q)) | 0;
    c[h >> 2] = m;
    if ((d | 0) != (e | 0)) m = (f + (d - b)) | 0;
    c[g >> 2] = m;
    if (!(a[l >> 0] & 1)) {
      i = k;
      return;
    }
    Uq(c[(l + 8) >> 2] | 0);
    i = k;
    return;
  }
  function ll(b, d, e, f, g, j) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    j = +j;
    var l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0;
    l = i;
    i = (i + 128) | 0;
    p = l;
    u = (l + 64) | 0;
    r = (l + 92) | 0;
    s = (l + 80) | 0;
    m = (l + 76) | 0;
    n = (l + 72) | 0;
    o = (l + 84) | 0;
    d = (l + 88) | 0;
    t = u;
    c[t >> 2] = 37;
    c[(t + 4) >> 2] = 0;
    t = (f + 4) | 0;
    v = il((u + 1) | 0, 17808, c[t >> 2] | 0) | 0;
    c[s >> 2] = r;
    w = Dk() | 0;
    if (v) {
      c[p >> 2] = c[(f + 8) >> 2];
      x = (p + 4) | 0;
      h[k >> 3] = j;
      c[x >> 2] = c[k >> 2];
      c[(x + 4) >> 2] = c[(k + 4) >> 2];
      w = cl(r, 30, w, u, p) | 0;
    } else {
      h[k >> 3] = j;
      c[p >> 2] = c[k >> 2];
      c[(p + 4) >> 2] = c[(k + 4) >> 2];
      w = cl(r, 30, w, u, p) | 0;
    }
    if ((w | 0) > 29) {
      if (v) {
        w = Dk() | 0;
        c[p >> 2] = c[(f + 8) >> 2];
        x = (p + 4) | 0;
        h[k >> 3] = j;
        c[x >> 2] = c[k >> 2];
        c[(x + 4) >> 2] = c[(k + 4) >> 2];
        w = jl(s, w, u, p) | 0;
      } else {
        w = Dk() | 0;
        h[k >> 3] = j;
        c[p >> 2] = c[k >> 2];
        c[(p + 4) >> 2] = c[(k + 4) >> 2];
        w = jl(s, w, u, p) | 0;
      }
      s = c[s >> 2] | 0;
      if (!s) {
        x = Wb(4) | 0;
        c[x >> 2] = 27280;
        Zc(x | 0, 27328, 220);
      } else v = s;
    } else {
      v = r;
      s = 0;
    }
    u = (v + w) | 0;
    t = c[t >> 2] & 176;
    do
      if ((t | 0) == 32) t = u;
      else if ((t | 0) == 16) {
        t = a[v >> 0] | 0;
        if (((t << 24) >> 24 == 43) | ((t << 24) >> 24 == 45)) {
          t = (v + 1) | 0;
          break;
        }
        if (
          ((w | 0) > 1) & ((t << 24) >> 24 == 48)
            ? ((x = a[(v + 1) >> 0] | 0), ((x << 24) >> 24 == 88) | ((x << 24) >> 24 == 120))
            : 0
        )
          t = (v + 2) | 0;
        else q = 19;
      } else q = 19;
    while (0);
    if ((q | 0) == 19) t = v;
    if ((v | 0) != (r | 0)) {
      p = Tq(w << 1) | 0;
      if (!p) {
        x = Wb(4) | 0;
        c[x >> 2] = 27280;
        Zc(x | 0, 27328, 220);
      } else {
        r = v;
        q = p;
      }
    } else q = 0;
    w = c[(f + 28) >> 2] | 0;
    c[o >> 2] = w;
    w = (w + 4) | 0;
    c[w >> 2] = (c[w >> 2] | 0) + 1;
    kl(r, t, u, p, m, n, o);
    o = c[o >> 2] | 0;
    w = (o + 4) | 0;
    x = c[w >> 2] | 0;
    c[w >> 2] = x + -1;
    if (!x) jd[c[((c[o >> 2] | 0) + 8) >> 2] & 255](o);
    Sg(d, c[e >> 2] | 0, p, c[m >> 2] | 0, c[n >> 2] | 0, f, g);
    c[b >> 2] = c[d >> 2];
    Uq(q);
    Uq(s);
    i = l;
    return;
  }
  function ml(b, d, e, f, g, h) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    var j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0;
    j = i;
    i = (i + 80) | 0;
    k = j;
    m = (j + 60) | 0;
    d = (j + 40) | 0;
    a[(m + 0) >> 0] = a[17888] | 0;
    a[(m + 1) >> 0] = a[17889] | 0;
    a[(m + 2) >> 0] = a[17890] | 0;
    a[(m + 3) >> 0] = a[17891] | 0;
    a[(m + 4) >> 0] = a[17892] | 0;
    a[(m + 5) >> 0] = a[17893] | 0;
    n = Dk() | 0;
    c[k >> 2] = h;
    m = cl(d, 20, n, m, k) | 0;
    h = (d + m) | 0;
    n = c[(f + 4) >> 2] & 176;
    do
      if ((n | 0) == 32) n = h;
      else if ((n | 0) == 16) {
        n = a[d >> 0] | 0;
        if (((n << 24) >> 24 == 43) | ((n << 24) >> 24 == 45)) {
          n = (d + 1) | 0;
          break;
        }
        if (
          ((m | 0) > 1) & ((n << 24) >> 24 == 48)
            ? ((o = a[(d + 1) >> 0] | 0), ((o << 24) >> 24 == 88) | ((o << 24) >> 24 == 120))
            : 0
        )
          n = (d + 2) | 0;
        else l = 7;
      } else l = 7;
    while (0);
    if ((l | 0) == 7) n = d;
    l = c[(f + 28) >> 2] | 0;
    o = (l + 4) | 0;
    c[o >> 2] = (c[o >> 2] | 0) + 1;
    o = Sn(l, 19072) | 0;
    q = (l + 4) | 0;
    p = c[q >> 2] | 0;
    c[q >> 2] = p + -1;
    if (!p) jd[c[((c[l >> 2] | 0) + 8) >> 2] & 255](l);
    sd[c[((c[o >> 2] | 0) + 32) >> 2] & 7](o, d, h, k) | 0;
    l = (k + m) | 0;
    if ((n | 0) == (h | 0)) {
      q = l;
      p = c[e >> 2] | 0;
      Sg(b, p, k, q, l, f, g);
      i = j;
      return;
    }
    q = (k + (n - d)) | 0;
    p = c[e >> 2] | 0;
    Sg(b, p, k, q, l, f, g);
    i = j;
    return;
  }
  function nl(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function ol(a) {
    a = a | 0;
    return;
  }
  function pl(b, d, e, f, g, h) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    var j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0;
    j = i;
    i = (i + 32) | 0;
    l = (j + 16) | 0;
    m = (j + 12) | 0;
    k = j;
    if (!(c[(f + 4) >> 2] & 1)) {
      k = c[((c[d >> 2] | 0) + 24) >> 2] | 0;
      c[m >> 2] = c[e >> 2];
      n = h & 1;
      c[(l + 0) >> 2] = c[(m + 0) >> 2];
      ud[k & 31](b, d, l, f, g, n);
      i = j;
      return;
    }
    d = c[(f + 28) >> 2] | 0;
    l = (d + 4) | 0;
    c[l >> 2] = (c[l >> 2] | 0) + 1;
    l = Sn(d, 19224) | 0;
    g = (d + 4) | 0;
    n = c[g >> 2] | 0;
    c[g >> 2] = n + -1;
    if (!n) jd[c[((c[d >> 2] | 0) + 8) >> 2] & 255](d);
    d = c[l >> 2] | 0;
    if (h) kd[c[(d + 24) >> 2] & 63](k, l);
    else kd[c[(d + 28) >> 2] & 63](k, l);
    m = a[k >> 0] | 0;
    if (!(m & 1)) {
      h = (k + 4) | 0;
      d = h;
      l = (k + 8) | 0;
    } else {
      l = (k + 8) | 0;
      d = c[l >> 2] | 0;
      h = (k + 4) | 0;
    }
    while (1) {
      g = (m & 1) == 0;
      if (g) {
        f = h;
        m = (m & 255) >>> 1;
      } else {
        f = c[l >> 2] | 0;
        m = c[h >> 2] | 0;
      }
      if ((d | 0) == ((f + (m << 2)) | 0)) break;
      n = c[d >> 2] | 0;
      g = c[e >> 2] | 0;
      if (g) {
        f = (g + 24) | 0;
        m = c[f >> 2] | 0;
        if ((m | 0) == (c[(g + 28) >> 2] | 0))
          n = vd[c[((c[g >> 2] | 0) + 52) >> 2] & 63](g, n) | 0;
        else {
          c[f >> 2] = m + 4;
          c[m >> 2] = n;
        }
        if ((n | 0) == -1) c[e >> 2] = 0;
      }
      m = a[k >> 0] | 0;
      d = (d + 4) | 0;
    }
    c[b >> 2] = c[e >> 2];
    if (g) {
      i = j;
      return;
    }
    Uq(c[(k + 8) >> 2] | 0);
    i = j;
    return;
  }
  function ql(b, d, e, f, g, h) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    var j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0;
    l = i;
    i = (i + 128) | 0;
    d = l;
    p = (l + 108) | 0;
    n = (l + 96) | 0;
    m = (l + 92) | 0;
    k = (l + 88) | 0;
    o = (l + 84) | 0;
    a[(p + 0) >> 0] = a[17880] | 0;
    a[(p + 1) >> 0] = a[17881] | 0;
    a[(p + 2) >> 0] = a[17882] | 0;
    a[(p + 3) >> 0] = a[17883] | 0;
    a[(p + 4) >> 0] = a[17884] | 0;
    a[(p + 5) >> 0] = a[17885] | 0;
    q = (f + 4) | 0;
    bl((p + 1) | 0, 17784, 1, c[q >> 2] | 0);
    r = Dk() | 0;
    c[d >> 2] = h;
    p = cl(n, 12, r, p, d) | 0;
    h = (n + p) | 0;
    q = c[q >> 2] & 176;
    do
      if ((q | 0) == 16) {
        q = a[n >> 0] | 0;
        if (((q << 24) >> 24 == 43) | ((q << 24) >> 24 == 45)) {
          p = (n + 1) | 0;
          break;
        }
        if (
          ((p | 0) > 1) & ((q << 24) >> 24 == 48)
            ? ((r = a[(n + 1) >> 0] | 0), ((r << 24) >> 24 == 88) | ((r << 24) >> 24 == 120))
            : 0
        )
          p = (n + 2) | 0;
        else j = 7;
      } else if ((q | 0) == 32) p = h;
      else j = 7;
    while (0);
    if ((j | 0) == 7) p = n;
    j = c[(f + 28) >> 2] | 0;
    c[o >> 2] = j;
    j = (j + 4) | 0;
    c[j >> 2] = (c[j >> 2] | 0) + 1;
    rl(n, p, h, d, m, k, o);
    j = c[o >> 2] | 0;
    q = (j + 4) | 0;
    r = c[q >> 2] | 0;
    c[q >> 2] = r + -1;
    if (r) {
      p = c[e >> 2] | 0;
      q = c[m >> 2] | 0;
      r = c[k >> 2] | 0;
      sl(b, p, d, q, r, f, g);
      i = l;
      return;
    }
    jd[c[((c[j >> 2] | 0) + 8) >> 2] & 255](j);
    p = c[e >> 2] | 0;
    q = c[m >> 2] | 0;
    r = c[k >> 2] | 0;
    sl(b, p, d, q, r, f, g);
    i = l;
    return;
  }
  function rl(b, d, e, f, g, h, j) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    var k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0;
    l = i;
    i = (i + 16) | 0;
    k = l;
    n = Sn(c[j >> 2] | 0, 19064) | 0;
    p = Sn(c[j >> 2] | 0, 19224) | 0;
    kd[c[((c[p >> 2] | 0) + 20) >> 2] & 63](k, p);
    j = a[k >> 0] | 0;
    if (!(j & 1)) j = (j & 255) >>> 1;
    else j = c[(k + 4) >> 2] | 0;
    if (j) {
      c[h >> 2] = f;
      j = a[b >> 0] | 0;
      if (((j << 24) >> 24 == 43) | ((j << 24) >> 24 == 45)) {
        v = vd[c[((c[n >> 2] | 0) + 44) >> 2] & 63](n, j) | 0;
        j = c[h >> 2] | 0;
        c[h >> 2] = j + 4;
        c[j >> 2] = v;
        j = (b + 1) | 0;
      } else j = b;
      if (
        (((e - j) | 0) > 1
        ? (a[j >> 0] | 0) == 48
        : 0)
          ? ((q = (j + 1) | 0),
            (v = a[q >> 0] | 0),
            ((v << 24) >> 24 == 88) | ((v << 24) >> 24 == 120))
          : 0
      ) {
        v = vd[c[((c[n >> 2] | 0) + 44) >> 2] & 63](n, 48) | 0;
        u = c[h >> 2] | 0;
        c[h >> 2] = u + 4;
        c[u >> 2] = v;
        u = vd[c[((c[n >> 2] | 0) + 44) >> 2] & 63](n, a[q >> 0] | 0) | 0;
        v = c[h >> 2] | 0;
        c[h >> 2] = v + 4;
        c[v >> 2] = u;
        j = (j + 2) | 0;
      }
      if ((j | 0) != (e | 0) ? ((o = (e + -1) | 0), o >>> 0 > j >>> 0) : 0) {
        q = j;
        do {
          v = a[q >> 0] | 0;
          a[q >> 0] = a[o >> 0] | 0;
          a[o >> 0] = v;
          q = (q + 1) | 0;
          o = (o + -1) | 0;
        } while (q >>> 0 < o >>> 0);
      }
      s = md[c[((c[p >> 2] | 0) + 16) >> 2] & 127](p) | 0;
      if (j >>> 0 < e >>> 0) {
        o = (k + 1) | 0;
        r = (k + 4) | 0;
        p = (k + 8) | 0;
        u = 0;
        t = 0;
        q = j;
        while (1) {
          v = a[(((a[k >> 0] & 1) == 0 ? o : c[p >> 2] | 0) + t) >> 0] | 0;
          if (((v << 24) >> 24 != 0) & ((u | 0) == (((v << 24) >> 24) | 0))) {
            u = c[h >> 2] | 0;
            c[h >> 2] = u + 4;
            c[u >> 2] = s;
            u = a[k >> 0] | 0;
            if (!(u & 1)) v = (u & 255) >>> 1;
            else v = c[r >> 2] | 0;
            u = 0;
            t = (((t >>> 0 < ((v + -1) | 0) >>> 0) & 1) + t) | 0;
          }
          x = vd[c[((c[n >> 2] | 0) + 44) >> 2] & 63](n, a[q >> 0] | 0) | 0;
          w = c[h >> 2] | 0;
          v = (w + 4) | 0;
          c[h >> 2] = v;
          c[w >> 2] = x;
          q = (q + 1) | 0;
          if (q >>> 0 >= e >>> 0) break;
          else u = (u + 1) | 0;
        }
      } else v = c[h >> 2] | 0;
      n = (f + ((j - b) << 2)) | 0;
      if ((n | 0) != (v | 0) ? ((m = (v + -4) | 0), m >>> 0 > n >>> 0) : 0)
        do {
          x = c[n >> 2] | 0;
          c[n >> 2] = c[m >> 2];
          c[m >> 2] = x;
          n = (n + 4) | 0;
          m = (m + -4) | 0;
        } while (n >>> 0 < m >>> 0);
    } else {
      sd[c[((c[n >> 2] | 0) + 48) >> 2] & 7](n, b, e, f) | 0;
      v = (f + ((e - b) << 2)) | 0;
      c[h >> 2] = v;
    }
    if ((d | 0) != (e | 0)) v = (f + ((d - b) << 2)) | 0;
    c[g >> 2] = v;
    if (!(a[k >> 0] & 1)) {
      i = l;
      return;
    }
    Uq(c[(k + 8) >> 2] | 0);
    i = l;
    return;
  }
  function sl(b, d, e, f, g, h, j) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    var k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0;
    k = i;
    i = (i + 16) | 0;
    l = k;
    if (!d) {
      c[b >> 2] = 0;
      i = k;
      return;
    }
    p = e;
    n = (g - p) >> 2;
    h = (h + 12) | 0;
    m = c[h >> 2] | 0;
    n = (m | 0) > (n | 0) ? (m - n) | 0 : 0;
    m = f;
    p = (m - p) | 0;
    o = p >> 2;
    if ((p | 0) > 0 ? (fd[c[((c[d >> 2] | 0) + 48) >> 2] & 31](d, e, o) | 0) != (o | 0) : 0) {
      c[b >> 2] = 0;
      i = k;
      return;
    }
    do
      if ((n | 0) > 0) {
        Si(l, n, j);
        if (!(a[l >> 0] & 1)) e = (l + 4) | 0;
        else e = c[(l + 8) >> 2] | 0;
        if ((fd[c[((c[d >> 2] | 0) + 48) >> 2] & 31](d, e, n) | 0) == (n | 0)) {
          if (!(a[l >> 0] & 1)) break;
          Uq(c[(l + 8) >> 2] | 0);
          break;
        }
        c[b >> 2] = 0;
        if (!(a[l >> 0] & 1)) {
          i = k;
          return;
        }
        Uq(c[(l + 8) >> 2] | 0);
        i = k;
        return;
      }
    while (0);
    p = (g - m) | 0;
    l = p >> 2;
    if ((p | 0) > 0 ? (fd[c[((c[d >> 2] | 0) + 48) >> 2] & 31](d, f, l) | 0) != (l | 0) : 0) {
      c[b >> 2] = 0;
      i = k;
      return;
    }
    c[h >> 2] = 0;
    c[b >> 2] = d;
    i = k;
    return;
  }
  function tl(b, d, e, f, g, h, j) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    var k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0;
    k = i;
    i = (i + 208) | 0;
    m = (k + 8) | 0;
    r = k;
    p = (k + 184) | 0;
    n = (k + 180) | 0;
    d = (k + 176) | 0;
    o = (k + 172) | 0;
    q = r;
    c[q >> 2] = 37;
    c[(q + 4) >> 2] = 0;
    q = (f + 4) | 0;
    bl((r + 1) | 0, 17792, 1, c[q >> 2] | 0);
    s = Dk() | 0;
    t = m;
    c[t >> 2] = h;
    c[(t + 4) >> 2] = j;
    h = cl(p, 22, s, r, m) | 0;
    j = (p + h) | 0;
    q = c[q >> 2] & 176;
    do
      if ((q | 0) == 16) {
        q = a[p >> 0] | 0;
        if (((q << 24) >> 24 == 43) | ((q << 24) >> 24 == 45)) {
          h = (p + 1) | 0;
          break;
        }
        if (
          ((h | 0) > 1) & ((q << 24) >> 24 == 48)
            ? ((t = a[(p + 1) >> 0] | 0), ((t << 24) >> 24 == 88) | ((t << 24) >> 24 == 120))
            : 0
        )
          h = (p + 2) | 0;
        else l = 7;
      } else if ((q | 0) == 32) h = j;
      else l = 7;
    while (0);
    if ((l | 0) == 7) h = p;
    l = c[(f + 28) >> 2] | 0;
    c[o >> 2] = l;
    l = (l + 4) | 0;
    c[l >> 2] = (c[l >> 2] | 0) + 1;
    rl(p, h, j, m, n, d, o);
    l = c[o >> 2] | 0;
    s = (l + 4) | 0;
    t = c[s >> 2] | 0;
    c[s >> 2] = t + -1;
    if (t) {
      r = c[e >> 2] | 0;
      s = c[n >> 2] | 0;
      t = c[d >> 2] | 0;
      sl(b, r, m, s, t, f, g);
      i = k;
      return;
    }
    jd[c[((c[l >> 2] | 0) + 8) >> 2] & 255](l);
    r = c[e >> 2] | 0;
    s = c[n >> 2] | 0;
    t = c[d >> 2] | 0;
    sl(b, r, m, s, t, f, g);
    i = k;
    return;
  }
  function ul(b, d, e, f, g, h) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    var j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0;
    l = i;
    i = (i + 128) | 0;
    d = l;
    p = (l + 108) | 0;
    n = (l + 96) | 0;
    m = (l + 92) | 0;
    k = (l + 88) | 0;
    o = (l + 84) | 0;
    a[(p + 0) >> 0] = a[17880] | 0;
    a[(p + 1) >> 0] = a[17881] | 0;
    a[(p + 2) >> 0] = a[17882] | 0;
    a[(p + 3) >> 0] = a[17883] | 0;
    a[(p + 4) >> 0] = a[17884] | 0;
    a[(p + 5) >> 0] = a[17885] | 0;
    q = (f + 4) | 0;
    bl((p + 1) | 0, 17784, 0, c[q >> 2] | 0);
    r = Dk() | 0;
    c[d >> 2] = h;
    p = cl(n, 12, r, p, d) | 0;
    h = (n + p) | 0;
    q = c[q >> 2] & 176;
    do
      if ((q | 0) == 16) {
        q = a[n >> 0] | 0;
        if (((q << 24) >> 24 == 43) | ((q << 24) >> 24 == 45)) {
          p = (n + 1) | 0;
          break;
        }
        if (
          ((p | 0) > 1) & ((q << 24) >> 24 == 48)
            ? ((r = a[(n + 1) >> 0] | 0), ((r << 24) >> 24 == 88) | ((r << 24) >> 24 == 120))
            : 0
        )
          p = (n + 2) | 0;
        else j = 7;
      } else if ((q | 0) == 32) p = h;
      else j = 7;
    while (0);
    if ((j | 0) == 7) p = n;
    j = c[(f + 28) >> 2] | 0;
    c[o >> 2] = j;
    j = (j + 4) | 0;
    c[j >> 2] = (c[j >> 2] | 0) + 1;
    rl(n, p, h, d, m, k, o);
    j = c[o >> 2] | 0;
    q = (j + 4) | 0;
    r = c[q >> 2] | 0;
    c[q >> 2] = r + -1;
    if (r) {
      p = c[e >> 2] | 0;
      q = c[m >> 2] | 0;
      r = c[k >> 2] | 0;
      sl(b, p, d, q, r, f, g);
      i = l;
      return;
    }
    jd[c[((c[j >> 2] | 0) + 8) >> 2] & 255](j);
    p = c[e >> 2] | 0;
    q = c[m >> 2] | 0;
    r = c[k >> 2] | 0;
    sl(b, p, d, q, r, f, g);
    i = l;
    return;
  }
  function vl(b, d, e, f, g, h, j) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    var k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0;
    k = i;
    i = (i + 224) | 0;
    m = (k + 8) | 0;
    r = k;
    p = (k + 192) | 0;
    n = (k + 188) | 0;
    d = (k + 184) | 0;
    o = (k + 180) | 0;
    q = r;
    c[q >> 2] = 37;
    c[(q + 4) >> 2] = 0;
    q = (f + 4) | 0;
    bl((r + 1) | 0, 17792, 0, c[q >> 2] | 0);
    s = Dk() | 0;
    t = m;
    c[t >> 2] = h;
    c[(t + 4) >> 2] = j;
    h = cl(p, 23, s, r, m) | 0;
    j = (p + h) | 0;
    q = c[q >> 2] & 176;
    do
      if ((q | 0) == 16) {
        q = a[p >> 0] | 0;
        if (((q << 24) >> 24 == 43) | ((q << 24) >> 24 == 45)) {
          h = (p + 1) | 0;
          break;
        }
        if (
          ((h | 0) > 1) & ((q << 24) >> 24 == 48)
            ? ((t = a[(p + 1) >> 0] | 0), ((t << 24) >> 24 == 88) | ((t << 24) >> 24 == 120))
            : 0
        )
          h = (p + 2) | 0;
        else l = 7;
      } else if ((q | 0) == 32) h = j;
      else l = 7;
    while (0);
    if ((l | 0) == 7) h = p;
    l = c[(f + 28) >> 2] | 0;
    c[o >> 2] = l;
    l = (l + 4) | 0;
    c[l >> 2] = (c[l >> 2] | 0) + 1;
    rl(p, h, j, m, n, d, o);
    l = c[o >> 2] | 0;
    s = (l + 4) | 0;
    t = c[s >> 2] | 0;
    c[s >> 2] = t + -1;
    if (t) {
      r = c[e >> 2] | 0;
      s = c[n >> 2] | 0;
      t = c[d >> 2] | 0;
      sl(b, r, m, s, t, f, g);
      i = k;
      return;
    }
    jd[c[((c[l >> 2] | 0) + 8) >> 2] & 255](l);
    r = c[e >> 2] | 0;
    s = c[n >> 2] | 0;
    t = c[d >> 2] | 0;
    sl(b, r, m, s, t, f, g);
    i = k;
    return;
  }
  function wl(b, d, e, f, g, j) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    j = +j;
    var l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0;
    m = i;
    i = (i + 304) | 0;
    p = m;
    u = (m + 232) | 0;
    r = (m + 260) | 0;
    s = (m + 248) | 0;
    n = (m + 244) | 0;
    l = (m + 240) | 0;
    o = (m + 252) | 0;
    d = (m + 256) | 0;
    t = u;
    c[t >> 2] = 37;
    c[(t + 4) >> 2] = 0;
    t = (f + 4) | 0;
    v = il((u + 1) | 0, 17800, c[t >> 2] | 0) | 0;
    c[s >> 2] = r;
    w = Dk() | 0;
    if (v) {
      c[p >> 2] = c[(f + 8) >> 2];
      x = (p + 4) | 0;
      h[k >> 3] = j;
      c[x >> 2] = c[k >> 2];
      c[(x + 4) >> 2] = c[(k + 4) >> 2];
      w = cl(r, 30, w, u, p) | 0;
    } else {
      h[k >> 3] = j;
      c[p >> 2] = c[k >> 2];
      c[(p + 4) >> 2] = c[(k + 4) >> 2];
      w = cl(r, 30, w, u, p) | 0;
    }
    if ((w | 0) > 29) {
      if (v) {
        w = Dk() | 0;
        c[p >> 2] = c[(f + 8) >> 2];
        x = (p + 4) | 0;
        h[k >> 3] = j;
        c[x >> 2] = c[k >> 2];
        c[(x + 4) >> 2] = c[(k + 4) >> 2];
        w = jl(s, w, u, p) | 0;
      } else {
        w = Dk() | 0;
        c[p >> 2] = c[(f + 8) >> 2];
        x = (p + 4) | 0;
        h[k >> 3] = j;
        c[x >> 2] = c[k >> 2];
        c[(x + 4) >> 2] = c[(k + 4) >> 2];
        w = jl(s, w, u, p) | 0;
      }
      s = c[s >> 2] | 0;
      if (!s) {
        x = Wb(4) | 0;
        c[x >> 2] = 27280;
        Zc(x | 0, 27328, 220);
      } else u = s;
    } else {
      u = r;
      s = 0;
    }
    v = (u + w) | 0;
    t = c[t >> 2] & 176;
    do
      if ((t | 0) == 16) {
        t = a[u >> 0] | 0;
        if (((t << 24) >> 24 == 43) | ((t << 24) >> 24 == 45)) {
          t = (u + 1) | 0;
          break;
        }
        if (
          ((w | 0) > 1) & ((t << 24) >> 24 == 48)
            ? ((x = a[(u + 1) >> 0] | 0), ((x << 24) >> 24 == 88) | ((x << 24) >> 24 == 120))
            : 0
        )
          t = (u + 2) | 0;
        else q = 19;
      } else if ((t | 0) == 32) t = v;
      else q = 19;
    while (0);
    if ((q | 0) == 19) t = u;
    if ((u | 0) != (r | 0)) {
      p = Tq(w << 3) | 0;
      if (!p) {
        x = Wb(4) | 0;
        c[x >> 2] = 27280;
        Zc(x | 0, 27328, 220);
      } else {
        r = u;
        q = p;
      }
    } else q = 0;
    w = c[(f + 28) >> 2] | 0;
    c[o >> 2] = w;
    w = (w + 4) | 0;
    c[w >> 2] = (c[w >> 2] | 0) + 1;
    xl(r, t, v, p, n, l, o);
    o = c[o >> 2] | 0;
    w = (o + 4) | 0;
    x = c[w >> 2] | 0;
    c[w >> 2] = x + -1;
    if (!x) jd[c[((c[o >> 2] | 0) + 8) >> 2] & 255](o);
    sl(d, c[e >> 2] | 0, p, c[n >> 2] | 0, c[l >> 2] | 0, f, g);
    x = c[d >> 2] | 0;
    c[e >> 2] = x;
    c[b >> 2] = x;
    if (!q) {
      Uq(s);
      i = m;
      return;
    }
    Uq(q);
    Uq(s);
    i = m;
    return;
  }
  function xl(b, d, e, f, g, h, j) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    var k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0,
      y = 0,
      z = 0,
      A = 0;
    l = i;
    i = (i + 16) | 0;
    k = l;
    m = Sn(c[j >> 2] | 0, 19064) | 0;
    n = Sn(c[j >> 2] | 0, 19224) | 0;
    kd[c[((c[n >> 2] | 0) + 20) >> 2] & 63](k, n);
    c[h >> 2] = f;
    j = a[b >> 0] | 0;
    if (((j << 24) >> 24 == 43) | ((j << 24) >> 24 == 45)) {
      y = vd[c[((c[m >> 2] | 0) + 44) >> 2] & 63](m, j) | 0;
      t = c[h >> 2] | 0;
      c[h >> 2] = t + 4;
      c[t >> 2] = y;
      t = (b + 1) | 0;
    } else t = b;
    j = e;
    a: do
      if (
        (((j - t) | 0) > 1
        ? (a[t >> 0] | 0) == 48
        : 0)
          ? ((p = (t + 1) | 0),
            (y = a[p >> 0] | 0),
            ((y << 24) >> 24 == 88) | ((y << 24) >> 24 == 120))
          : 0
      ) {
        y = vd[c[((c[m >> 2] | 0) + 44) >> 2] & 63](m, 48) | 0;
        x = c[h >> 2] | 0;
        c[h >> 2] = x + 4;
        c[x >> 2] = y;
        t = (t + 2) | 0;
        x = vd[c[((c[m >> 2] | 0) + 44) >> 2] & 63](m, a[p >> 0] | 0) | 0;
        y = c[h >> 2] | 0;
        c[h >> 2] = y + 4;
        c[y >> 2] = x;
        if (t >>> 0 < e >>> 0) {
          q = t;
          while (1) {
            y = a[q >> 0] | 0;
            Dk() | 0;
            y = (y << 24) >> 24;
            if (((y + -48) | 0) >>> 0 >= 10 ? (((y | 32) + -97) | 0) >>> 0 >= 6 : 0) {
              p = t;
              break a;
            }
            q = (q + 1) | 0;
            if (q >>> 0 >= e >>> 0) {
              p = t;
              break;
            }
          }
        } else {
          p = t;
          q = t;
        }
      } else s = 5;
    while (0);
    b: do
      if ((s | 0) == 5)
        if (t >>> 0 < e >>> 0) {
          q = t;
          while (1) {
            y = a[q >> 0] | 0;
            Dk() | 0;
            s = (q + 1) | 0;
            if (((((y << 24) >> 24) + -48) | 0) >>> 0 >= 10) {
              p = t;
              break b;
            }
            if (s >>> 0 < e >>> 0) q = s;
            else {
              p = t;
              q = s;
              break;
            }
          }
        } else {
          p = t;
          q = t;
        }
    while (0);
    s = a[k >> 0] | 0;
    if (!(s & 1)) s = (s & 255) >>> 1;
    else s = c[(k + 4) >> 2] | 0;
    if (s) {
      if ((p | 0) != (q | 0) ? ((r = (q + -1) | 0), r >>> 0 > p >>> 0) : 0) {
        s = p;
        do {
          y = a[s >> 0] | 0;
          a[s >> 0] = a[r >> 0] | 0;
          a[r >> 0] = y;
          s = (s + 1) | 0;
          r = (r + -1) | 0;
        } while (s >>> 0 < r >>> 0);
      }
      t = md[c[((c[n >> 2] | 0) + 16) >> 2] & 127](n) | 0;
      if (p >>> 0 < q >>> 0) {
        r = (k + 1) | 0;
        s = (k + 4) | 0;
        v = (k + 8) | 0;
        x = 0;
        w = 0;
        u = p;
        while (1) {
          y = a[(((a[k >> 0] & 1) == 0 ? r : c[v >> 2] | 0) + w) >> 0] | 0;
          if (((y << 24) >> 24 > 0) & ((x | 0) == (((y << 24) >> 24) | 0))) {
            x = c[h >> 2] | 0;
            c[h >> 2] = x + 4;
            c[x >> 2] = t;
            x = a[k >> 0] | 0;
            if (!(x & 1)) y = (x & 255) >>> 1;
            else y = c[s >> 2] | 0;
            x = 0;
            w = (((w >>> 0 < ((y + -1) | 0) >>> 0) & 1) + w) | 0;
          }
          A = vd[c[((c[m >> 2] | 0) + 44) >> 2] & 63](m, a[u >> 0] | 0) | 0;
          z = c[h >> 2] | 0;
          y = (z + 4) | 0;
          c[h >> 2] = y;
          c[z >> 2] = A;
          u = (u + 1) | 0;
          if (u >>> 0 >= q >>> 0) break;
          else x = (x + 1) | 0;
        }
      } else y = c[h >> 2] | 0;
      p = (f + ((p - b) << 2)) | 0;
      if ((p | 0) != (y | 0) ? ((o = (y + -4) | 0), o >>> 0 > p >>> 0) : 0)
        do {
          A = c[p >> 2] | 0;
          c[p >> 2] = c[o >> 2];
          c[o >> 2] = A;
          p = (p + 4) | 0;
          o = (o + -4) | 0;
        } while (p >>> 0 < o >>> 0);
    } else {
      sd[c[((c[m >> 2] | 0) + 48) >> 2] & 7](m, p, q, c[h >> 2] | 0) | 0;
      y = ((c[h >> 2] | 0) + ((q - p) << 2)) | 0;
      c[h >> 2] = y;
    }
    c: do
      if (q >>> 0 < e >>> 0) {
        while (1) {
          o = a[q >> 0] | 0;
          if ((o << 24) >> 24 == 46) break;
          z = vd[c[((c[m >> 2] | 0) + 44) >> 2] & 63](m, o) | 0;
          A = c[h >> 2] | 0;
          y = (A + 4) | 0;
          c[h >> 2] = y;
          c[A >> 2] = z;
          q = (q + 1) | 0;
          if (q >>> 0 >= e >>> 0) break c;
        }
        z = md[c[((c[n >> 2] | 0) + 12) >> 2] & 127](n) | 0;
        A = c[h >> 2] | 0;
        y = (A + 4) | 0;
        c[h >> 2] = y;
        c[A >> 2] = z;
        q = (q + 1) | 0;
      }
    while (0);
    sd[c[((c[m >> 2] | 0) + 48) >> 2] & 7](m, q, e, y) | 0;
    m = ((c[h >> 2] | 0) + ((j - q) << 2)) | 0;
    c[h >> 2] = m;
    if ((d | 0) != (e | 0)) m = (f + ((d - b) << 2)) | 0;
    c[g >> 2] = m;
    if (!(a[k >> 0] & 1)) {
      i = l;
      return;
    }
    Uq(c[(k + 8) >> 2] | 0);
    i = l;
    return;
  }
  function yl(b, d, e, f, g, j) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    j = +j;
    var l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0;
    m = i;
    i = (i + 304) | 0;
    p = m;
    u = (m + 232) | 0;
    r = (m + 260) | 0;
    s = (m + 248) | 0;
    n = (m + 244) | 0;
    l = (m + 240) | 0;
    o = (m + 252) | 0;
    d = (m + 256) | 0;
    t = u;
    c[t >> 2] = 37;
    c[(t + 4) >> 2] = 0;
    t = (f + 4) | 0;
    v = il((u + 1) | 0, 17808, c[t >> 2] | 0) | 0;
    c[s >> 2] = r;
    w = Dk() | 0;
    if (v) {
      c[p >> 2] = c[(f + 8) >> 2];
      x = (p + 4) | 0;
      h[k >> 3] = j;
      c[x >> 2] = c[k >> 2];
      c[(x + 4) >> 2] = c[(k + 4) >> 2];
      w = cl(r, 30, w, u, p) | 0;
    } else {
      h[k >> 3] = j;
      c[p >> 2] = c[k >> 2];
      c[(p + 4) >> 2] = c[(k + 4) >> 2];
      w = cl(r, 30, w, u, p) | 0;
    }
    if ((w | 0) > 29) {
      if (v) {
        w = Dk() | 0;
        c[p >> 2] = c[(f + 8) >> 2];
        x = (p + 4) | 0;
        h[k >> 3] = j;
        c[x >> 2] = c[k >> 2];
        c[(x + 4) >> 2] = c[(k + 4) >> 2];
        w = jl(s, w, u, p) | 0;
      } else {
        w = Dk() | 0;
        h[k >> 3] = j;
        c[p >> 2] = c[k >> 2];
        c[(p + 4) >> 2] = c[(k + 4) >> 2];
        w = jl(s, w, u, p) | 0;
      }
      s = c[s >> 2] | 0;
      if (!s) {
        x = Wb(4) | 0;
        c[x >> 2] = 27280;
        Zc(x | 0, 27328, 220);
      } else u = s;
    } else {
      u = r;
      s = 0;
    }
    v = (u + w) | 0;
    t = c[t >> 2] & 176;
    do
      if ((t | 0) == 16) {
        t = a[u >> 0] | 0;
        if (((t << 24) >> 24 == 43) | ((t << 24) >> 24 == 45)) {
          t = (u + 1) | 0;
          break;
        }
        if (
          ((w | 0) > 1) & ((t << 24) >> 24 == 48)
            ? ((x = a[(u + 1) >> 0] | 0), ((x << 24) >> 24 == 88) | ((x << 24) >> 24 == 120))
            : 0
        )
          t = (u + 2) | 0;
        else q = 19;
      } else if ((t | 0) == 32) t = v;
      else q = 19;
    while (0);
    if ((q | 0) == 19) t = u;
    if ((u | 0) != (r | 0)) {
      p = Tq(w << 3) | 0;
      if (!p) {
        x = Wb(4) | 0;
        c[x >> 2] = 27280;
        Zc(x | 0, 27328, 220);
      } else {
        r = u;
        q = p;
      }
    } else q = 0;
    w = c[(f + 28) >> 2] | 0;
    c[o >> 2] = w;
    w = (w + 4) | 0;
    c[w >> 2] = (c[w >> 2] | 0) + 1;
    xl(r, t, v, p, n, l, o);
    o = c[o >> 2] | 0;
    w = (o + 4) | 0;
    x = c[w >> 2] | 0;
    c[w >> 2] = x + -1;
    if (!x) jd[c[((c[o >> 2] | 0) + 8) >> 2] & 255](o);
    sl(d, c[e >> 2] | 0, p, c[n >> 2] | 0, c[l >> 2] | 0, f, g);
    x = c[d >> 2] | 0;
    c[e >> 2] = x;
    c[b >> 2] = x;
    if (!q) {
      Uq(s);
      i = m;
      return;
    }
    Uq(q);
    Uq(s);
    i = m;
    return;
  }
  function zl(b, d, e, f, g, h) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    var j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0;
    j = i;
    i = (i + 176) | 0;
    k = j;
    m = (j + 168) | 0;
    d = (j + 148) | 0;
    a[(m + 0) >> 0] = a[17888] | 0;
    a[(m + 1) >> 0] = a[17889] | 0;
    a[(m + 2) >> 0] = a[17890] | 0;
    a[(m + 3) >> 0] = a[17891] | 0;
    a[(m + 4) >> 0] = a[17892] | 0;
    a[(m + 5) >> 0] = a[17893] | 0;
    n = Dk() | 0;
    c[k >> 2] = h;
    m = cl(d, 20, n, m, k) | 0;
    h = (d + m) | 0;
    n = c[(f + 4) >> 2] & 176;
    do
      if ((n | 0) == 16) {
        n = a[d >> 0] | 0;
        if (((n << 24) >> 24 == 43) | ((n << 24) >> 24 == 45)) {
          n = (d + 1) | 0;
          break;
        }
        if (
          ((m | 0) > 1) & ((n << 24) >> 24 == 48)
            ? ((o = a[(d + 1) >> 0] | 0), ((o << 24) >> 24 == 88) | ((o << 24) >> 24 == 120))
            : 0
        )
          n = (d + 2) | 0;
        else l = 7;
      } else if ((n | 0) == 32) n = h;
      else l = 7;
    while (0);
    if ((l | 0) == 7) n = d;
    l = c[(f + 28) >> 2] | 0;
    o = (l + 4) | 0;
    c[o >> 2] = (c[o >> 2] | 0) + 1;
    o = Sn(l, 19064) | 0;
    q = (l + 4) | 0;
    p = c[q >> 2] | 0;
    c[q >> 2] = p + -1;
    if (!p) jd[c[((c[l >> 2] | 0) + 8) >> 2] & 255](l);
    sd[c[((c[o >> 2] | 0) + 48) >> 2] & 7](o, d, h, k) | 0;
    l = (k + (m << 2)) | 0;
    if ((n | 0) == (h | 0)) {
      q = l;
      p = c[e >> 2] | 0;
      sl(b, p, k, q, l, f, g);
      i = j;
      return;
    }
    q = (k + ((n - d) << 2)) | 0;
    p = c[e >> 2] | 0;
    sl(b, p, k, q, l, f, g);
    i = j;
    return;
  }
  function Al(e, f, g, h, j, k, l, m, n) {
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    k = k | 0;
    l = l | 0;
    m = m | 0;
    n = n | 0;
    var o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0,
      y = 0,
      z = 0,
      A = 0,
      B = 0,
      C = 0,
      D = 0;
    o = i;
    i = (i + 32) | 0;
    t = (o + 16) | 0;
    q = (o + 12) | 0;
    w = (o + 8) | 0;
    s = (o + 4) | 0;
    r = o;
    x = c[(j + 28) >> 2] | 0;
    v = (x + 4) | 0;
    c[v >> 2] = (c[v >> 2] | 0) + 1;
    v = Sn(x, 19072) | 0;
    C = (x + 4) | 0;
    D = c[C >> 2] | 0;
    c[C >> 2] = D + -1;
    if (!D) jd[c[((c[x >> 2] | 0) + 8) >> 2] & 255](x);
    c[k >> 2] = 0;
    a: do
      if ((m | 0) != (n | 0)) {
        x = (v + 8) | 0;
        y = 0;
        b: while (1) {
          z = y;
          y = g;
          while (1) {
            if (z) {
              g = y;
              break a;
            }
            if (y)
              if ((c[(y + 12) >> 2] | 0) == (c[(y + 16) >> 2] | 0)) {
                D = (md[c[((c[y >> 2] | 0) + 36) >> 2] & 127](y) | 0) == -1;
                g = D ? 0 : y;
                y = D ? 0 : y;
              } else g = y;
            else {
              g = 0;
              y = 0;
            }
            z = (g | 0) == 0;
            do
              if (h) {
                if (
                  (c[(h + 12) >> 2] | 0) == (c[(h + 16) >> 2] | 0)
                    ? (md[c[((c[h >> 2] | 0) + 36) >> 2] & 127](h) | 0) == -1
                    : 0
                ) {
                  p = 15;
                  break;
                }
                if (!z) {
                  p = 16;
                  break b;
                }
              } else p = 15;
            while (0);
            if ((p | 0) == 15) {
              p = 0;
              if (z) {
                h = 0;
                p = 16;
                break b;
              } else h = 0;
            }
            if (
              ((fd[c[((c[v >> 2] | 0) + 36) >> 2] & 31](v, a[m >> 0] | 0, 0) | 0) << 24) >> 24 ==
              37
            ) {
              p = 18;
              break;
            }
            z = a[m >> 0] | 0;
            if (
              (z << 24) >> 24 > -1
                ? ((u = c[x >> 2] | 0), (b[(u + (((z << 24) >> 24) << 1)) >> 1] & 8192) != 0)
                : 0
            ) {
              p = 29;
              break;
            }
            A = (g + 12) | 0;
            B = c[A >> 2] | 0;
            z = (g + 16) | 0;
            if ((B | 0) == (c[z >> 2] | 0)) B = md[c[((c[g >> 2] | 0) + 36) >> 2] & 127](g) | 0;
            else B = d[B >> 0] | 0;
            D = vd[c[((c[v >> 2] | 0) + 12) >> 2] & 63](v, B & 255) | 0;
            if (
              (D << 24) >> 24 ==
              ((vd[c[((c[v >> 2] | 0) + 12) >> 2] & 63](v, a[m >> 0] | 0) | 0) << 24) >> 24
            ) {
              p = 54;
              break;
            }
            c[k >> 2] = 4;
            z = 4;
          }
          c: do
            if ((p | 0) == 18) {
              p = 0;
              z = (m + 1) | 0;
              if ((z | 0) == (n | 0)) {
                p = 19;
                break b;
              }
              y = fd[c[((c[v >> 2] | 0) + 36) >> 2] & 31](v, a[z >> 0] | 0, 0) | 0;
              if (((y << 24) >> 24 == 48) | ((y << 24) >> 24 == 69)) {
                z = (m + 2) | 0;
                if ((z | 0) == (n | 0)) {
                  p = 22;
                  break b;
                }
                m = z;
                z = fd[c[((c[v >> 2] | 0) + 36) >> 2] & 31](v, a[z >> 0] | 0, 0) | 0;
              } else {
                m = z;
                z = y;
                y = 0;
              }
              D = c[((c[f >> 2] | 0) + 36) >> 2] | 0;
              c[s >> 2] = g;
              c[r >> 2] = h;
              c[(q + 0) >> 2] = c[(s + 0) >> 2];
              c[(t + 0) >> 2] = c[(r + 0) >> 2];
              ld[D & 3](w, f, q, t, j, k, l, z, y);
              m = (m + 1) | 0;
              g = c[w >> 2] | 0;
            } else if ((p | 0) == 29) {
              while (1) {
                p = 0;
                m = (m + 1) | 0;
                if ((m | 0) == (n | 0)) {
                  m = n;
                  break;
                }
                z = a[m >> 0] | 0;
                if ((z << 24) >> 24 <= -1) break;
                if (!(b[(u + (((z << 24) >> 24) << 1)) >> 1] & 8192)) break;
                else p = 29;
              }
              B = h;
              A = h;
              while (1) {
                if (g) {
                  if ((c[(g + 12) >> 2] | 0) == (c[(g + 16) >> 2] | 0)) {
                    D = (md[c[((c[g >> 2] | 0) + 36) >> 2] & 127](g) | 0) == -1;
                    g = D ? 0 : g;
                    y = D ? 0 : y;
                  }
                } else g = 0;
                C = (g | 0) == 0;
                do
                  if (A) {
                    if ((c[(A + 12) >> 2] | 0) != (c[(A + 16) >> 2] | 0))
                      if (C) {
                        z = B;
                        break;
                      } else {
                        g = y;
                        break c;
                      }
                    if ((md[c[((c[A >> 2] | 0) + 36) >> 2] & 127](A) | 0) != -1)
                      if (C ^ ((B | 0) == 0)) {
                        z = B;
                        A = B;
                      } else {
                        g = y;
                        break c;
                      }
                    else {
                      z = 0;
                      h = 0;
                      p = 40;
                    }
                  } else {
                    z = B;
                    p = 40;
                  }
                while (0);
                if ((p | 0) == 40) {
                  p = 0;
                  if (C) {
                    g = y;
                    break c;
                  } else A = 0;
                }
                C = (g + 12) | 0;
                D = c[C >> 2] | 0;
                B = (g + 16) | 0;
                if ((D | 0) == (c[B >> 2] | 0)) D = md[c[((c[g >> 2] | 0) + 36) >> 2] & 127](g) | 0;
                else D = d[D >> 0] | 0;
                if (((D & 255) << 24) >> 24 <= -1) {
                  g = y;
                  break c;
                }
                if (!(b[((c[x >> 2] | 0) + (((D << 24) >> 24) << 1)) >> 1] & 8192)) {
                  g = y;
                  break c;
                }
                D = c[C >> 2] | 0;
                if ((D | 0) == (c[B >> 2] | 0)) {
                  md[c[((c[g >> 2] | 0) + 40) >> 2] & 127](g) | 0;
                  B = z;
                  continue;
                } else {
                  c[C >> 2] = D + 1;
                  B = z;
                  continue;
                }
              }
            } else if ((p | 0) == 54) {
              p = 0;
              B = c[A >> 2] | 0;
              if ((B | 0) == (c[z >> 2] | 0)) md[c[((c[g >> 2] | 0) + 40) >> 2] & 127](g) | 0;
              else c[A >> 2] = B + 1;
              m = (m + 1) | 0;
              g = y;
            }
          while (0);
          if ((m | 0) == (n | 0)) break a;
          y = c[k >> 2] | 0;
        }
        if ((p | 0) == 16) {
          c[k >> 2] = 4;
          break;
        } else if ((p | 0) == 19) {
          c[k >> 2] = 4;
          break;
        } else if ((p | 0) == 22) {
          c[k >> 2] = 4;
          break;
        }
      }
    while (0);
    if (g) {
      if ((c[(g + 12) >> 2] | 0) == (c[(g + 16) >> 2] | 0)) {
        D = (md[c[((c[g >> 2] | 0) + 36) >> 2] & 127](g) | 0) == -1;
        g = D ? 0 : g;
      }
    } else g = 0;
    l = (g | 0) == 0;
    do
      if (h) {
        if (
          (c[(h + 12) >> 2] | 0) == (c[(h + 16) >> 2] | 0)
            ? (md[c[((c[h >> 2] | 0) + 36) >> 2] & 127](h) | 0) == -1
            : 0
        ) {
          p = 66;
          break;
        }
        if (l) {
          c[e >> 2] = g;
          i = o;
          return;
        }
      } else p = 66;
    while (0);
    if ((p | 0) == 66 ? !l : 0) {
      c[e >> 2] = g;
      i = o;
      return;
    }
    c[k >> 2] = c[k >> 2] | 2;
    c[e >> 2] = g;
    i = o;
    return;
  }
  function Bl(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function Cl(a) {
    a = a | 0;
    return;
  }
  function Dl(a) {
    a = a | 0;
    return 2;
  }
  function El(a, b, d, e, f, g, h) {
    a = a | 0;
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    var j = 0;
    j = i;
    Al(a, b, c[d >> 2] | 0, c[e >> 2] | 0, f, g, h, 17992, 18e3 | 0);
    i = j;
    return;
  }
  function Fl(b, d, e, f, g, h, j) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    j = j | 0;
    var k = 0,
      l = 0,
      m = 0,
      n = 0;
    k = i;
    m = (d + 8) | 0;
    m = md[c[((c[m >> 2] | 0) + 20) >> 2] & 127](m) | 0;
    n = a[m >> 0] | 0;
    if (!(n & 1)) {
      l = (m + 1) | 0;
      m = (n & 255) >>> 1;
    } else {
      l = c[(m + 8) >> 2] | 0;
      m = c[(m + 4) >> 2] | 0;
    }
    Al(b, d, c[e >> 2] | 0, c[f >> 2] | 0, g, h, j, l, (l + m) | 0);
    i = k;
    return;
  }
  function Gl(a, b, d, e, f, g, h) {
    a = a | 0;
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    var j = 0,
      k = 0,
      l = 0,
      m = 0;
    j = i;
    k = c[(f + 28) >> 2] | 0;
    f = (k + 4) | 0;
    c[f >> 2] = (c[f >> 2] | 0) + 1;
    f = Sn(k, 19072) | 0;
    m = (k + 4) | 0;
    l = c[m >> 2] | 0;
    c[m >> 2] = l + -1;
    if (!l) jd[c[((c[k >> 2] | 0) + 8) >> 2] & 255](k);
    Hl(b, (h + 24) | 0, d, c[e >> 2] | 0, g, f);
    c[a >> 2] = c[d >> 2];
    i = j;
    return;
  }
  function Hl(a, b, d, e, f, g) {
    a = a | 0;
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    var h = 0;
    h = i;
    a = (a + 8) | 0;
    a = md[c[c[a >> 2] >> 2] & 127](a) | 0;
    f = ((qk(d, e, a, (a + 168) | 0, g, f, 0) | 0) - a) | 0;
    if ((f | 0) >= 168) {
      i = h;
      return;
    }
    c[b >> 2] = (((f | 0) / 12) | 0 | 0) % 7 | 0;
    i = h;
    return;
  }
  function Il(a, b, d, e, f, g, h) {
    a = a | 0;
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    var j = 0,
      k = 0,
      l = 0,
      m = 0;
    j = i;
    k = c[(f + 28) >> 2] | 0;
    f = (k + 4) | 0;
    c[f >> 2] = (c[f >> 2] | 0) + 1;
    f = Sn(k, 19072) | 0;
    m = (k + 4) | 0;
    l = c[m >> 2] | 0;
    c[m >> 2] = l + -1;
    if (!l) jd[c[((c[k >> 2] | 0) + 8) >> 2] & 255](k);
    Jl(b, (h + 16) | 0, d, c[e >> 2] | 0, g, f);
    c[a >> 2] = c[d >> 2];
    i = j;
    return;
  }
  function Jl(a, b, d, e, f, g) {
    a = a | 0;
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    var h = 0;
    h = i;
    a = (a + 8) | 0;
    a = md[c[((c[a >> 2] | 0) + 4) >> 2] & 127](a) | 0;
    f = ((qk(d, e, a, (a + 288) | 0, g, f, 0) | 0) - a) | 0;
    if ((f | 0) >= 288) {
      i = h;
      return;
    }
    c[b >> 2] = (((f | 0) / 12) | 0 | 0) % 12 | 0;
    i = h;
    return;
  }
  function Kl(a, b, d, e, f, g, h) {
    a = a | 0;
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    var j = 0,
      k = 0,
      l = 0;
    b = i;
    j = c[(f + 28) >> 2] | 0;
    f = (j + 4) | 0;
    c[f >> 2] = (c[f >> 2] | 0) + 1;
    f = Sn(j, 19072) | 0;
    l = (j + 4) | 0;
    k = c[l >> 2] | 0;
    c[l >> 2] = k + -1;
    if (!k) jd[c[((c[j >> 2] | 0) + 8) >> 2] & 255](j);
    Ll((h + 20) | 0, d, c[e >> 2] | 0, g, f);
    c[a >> 2] = c[d >> 2];
    i = b;
    return;
  }
  function Ll(a, b, d, e, f) {
    a = a | 0;
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    var g = 0;
    g = i;
    f = Nl(b, d, e, f, 4) | 0;
    if (c[e >> 2] & 4) {
      i = g;
      return;
    }
    if ((f | 0) < 69) e = (f + 2e3) | 0;
    else e = ((f + -69) | 0) >>> 0 < 31 ? (f + 1900) | 0 : f;
    c[a >> 2] = e + -1900;
    i = g;
    return;
  }

  function yd(a) {
    a = a | 0;
    var b = 0;
    b = i;
    i = (i + a) | 0;
    i = (i + 15) & -16;
    return b | 0;
  }
  function zd() {
    return i | 0;
  }
  function Ad(a) {
    a = a | 0;
    i = a;
  }
  function Bd(a, b) {
    a = a | 0;
    b = b | 0;
    if (!s) {
      s = a;
      t = b;
    }
  }
  function Cd(b) {
    b = b | 0;
    a[k >> 0] = a[b >> 0];
    a[(k + 1) >> 0] = a[(b + 1) >> 0];
    a[(k + 2) >> 0] = a[(b + 2) >> 0];
    a[(k + 3) >> 0] = a[(b + 3) >> 0];
  }
  function Dd(b) {
    b = b | 0;
    a[k >> 0] = a[b >> 0];
    a[(k + 1) >> 0] = a[(b + 1) >> 0];
    a[(k + 2) >> 0] = a[(b + 2) >> 0];
    a[(k + 3) >> 0] = a[(b + 3) >> 0];
    a[(k + 4) >> 0] = a[(b + 4) >> 0];
    a[(k + 5) >> 0] = a[(b + 5) >> 0];
    a[(k + 6) >> 0] = a[(b + 6) >> 0];
    a[(k + 7) >> 0] = a[(b + 7) >> 0];
  }
  function Ed(a) {
    a = a | 0;
    H = a;
  }
  function Fd() {
    return H | 0;
  }
  function Gd(b, e, f) {
    b = b | 0;
    e = e | 0;
    f = f | 0;
    var g = 0,
      j = 0,
      l = 0,
      m = 0,
      n = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0,
      y = 0,
      z = 0,
      A = 0,
      B = 0,
      C = 0,
      D = 0,
      E = 0,
      F = 0,
      G = 0,
      I = 0,
      J = 0,
      K = 0,
      L = 0,
      M = 0.0,
      N = 0.0,
      O = 0.0,
      P = 0.0,
      Q = 0.0,
      R = 0.0;
    g = i;
    i = (i + 224) | 0;
    s = (g + 24) | 0;
    q = (g + 80) | 0;
    m = (g + 200) | 0;
    j = (g + 184) | 0;
    l = (g + 104) | 0;
    C = (g + 216) | 0;
    B = (g + 88) | 0;
    y = g;
    t = Rg(14024, 10064, 9) | 0;
    a[m >> 0] = 0;
    c[(m + 4) >> 2] = t;
    v = c[((c[t >> 2] | 0) + -12) >> 2] | 0;
    do
      if (!(c[(t + (v + 16)) >> 2] | 0)) {
        v = c[(t + (v + 72)) >> 2] | 0;
        if (v) Fj(v);
        a[m >> 0] = 1;
        D = c[(t + ((c[((c[t >> 2] | 0) + -12) >> 2] | 0) + 28)) >> 2] | 0;
        x = (D + 4) | 0;
        c[x >> 2] = (c[x >> 2] | 0) + 1;
        w = Rn(17776) | 0;
        v = c[(D + 8) >> 2] | 0;
        if (
          (((c[(D + 12) >> 2] | 0) - v) >> 2) >>> 0 > w >>> 0
            ? ((r = c[(v + (w << 2)) >> 2] | 0), (r | 0) != 0)
            : 0
        ) {
          L = c[x >> 2] | 0;
          c[x >> 2] = L + -1;
          if (!L) jd[c[((c[D >> 2] | 0) + 8) >> 2] & 255](D);
          E = c[((c[t >> 2] | 0) + -12) >> 2] | 0;
          w = c[(t + (E + 24)) >> 2] | 0;
          v = (t + E) | 0;
          x = (t + (E + 76)) | 0;
          D = c[x >> 2] | 0;
          do
            if ((D | 0) == -1) {
              D = c[(t + (E + 28)) >> 2] | 0;
              E = (D + 4) | 0;
              c[E >> 2] = (c[E >> 2] | 0) + 1;
              F = Rn(19072) | 0;
              G = c[(D + 8) >> 2] | 0;
              if (
                (((c[(D + 12) >> 2] | 0) - G) >> 2) >>> 0 > F >>> 0
                  ? ((u = c[(G + (F << 2)) >> 2] | 0), (u | 0) != 0)
                  : 0
              ) {
                u = vd[c[((c[u >> 2] | 0) + 28) >> 2] & 63](u, 32) | 0;
                L = c[E >> 2] | 0;
                c[E >> 2] = L + -1;
                if (!L) jd[c[((c[D >> 2] | 0) + 8) >> 2] & 255](D);
                D = (u << 24) >> 24;
                c[x >> 2] = D;
                break;
              }
              L = Wb(4) | 0;
              c[L >> 2] = 27744;
              Zc(L | 0, 27816, 228);
            }
          while (0);
          L = D & 255;
          K = c[((c[r >> 2] | 0) + 24) >> 2] | 0;
          c[q >> 2] = w;
          c[(s + 0) >> 2] = c[(q + 0) >> 2];
          ud[K & 31](j, r, s, v, L, f);
          if (c[j >> 2] | 0) break;
          L = c[((c[t >> 2] | 0) + -12) >> 2] | 0;
          Zi((t + L) | 0, c[(t + (L + 16)) >> 2] | 5);
          break;
        }
        L = Wb(4) | 0;
        c[L >> 2] = 27744;
        Zc(L | 0, 27816, 228);
      }
    while (0);
    Qj(m);
    r = Rg(t, 10080, 6) | 0;
    t = c[(r + ((c[((c[r >> 2] | 0) + -12) >> 2] | 0) + 28)) >> 2] | 0;
    u = (t + 4) | 0;
    c[u >> 2] = (c[u >> 2] | 0) + 1;
    w = Rn(19072) | 0;
    v = c[(t + 8) >> 2] | 0;
    if (
      (((c[(t + 12) >> 2] | 0) - v) >> 2) >>> 0 > w >>> 0
        ? ((p = c[(v + (w << 2)) >> 2] | 0), (p | 0) != 0)
        : 0
    ) {
      p = vd[c[((c[p >> 2] | 0) + 28) >> 2] & 63](p, 10) | 0;
      L = c[u >> 2] | 0;
      c[u >> 2] = L + -1;
      if (!L) jd[c[((c[t >> 2] | 0) + 8) >> 2] & 255](t);
      a[s >> 0] = 0;
      c[(s + 4) >> 2] = r;
      t = c[((c[r >> 2] | 0) + -12) >> 2] | 0;
      do
        if (!(c[(r + (t + 16)) >> 2] | 0)) {
          t = c[(r + (t + 72)) >> 2] | 0;
          if (t) Fj(t);
          a[s >> 0] = 1;
          u = c[((c[r >> 2] | 0) + -12) >> 2] | 0;
          t = c[(r + (u + 24)) >> 2] | 0;
          if (t) {
            u = (t + 24) | 0;
            v = c[u >> 2] | 0;
            if ((v | 0) != (c[(t + 28) >> 2] | 0)) {
              c[u >> 2] = v + 1;
              a[v >> 0] = p;
              break;
            }
            if ((vd[c[((c[t >> 2] | 0) + 52) >> 2] & 63](t, p & 255) | 0) != -1) break;
            u = c[((c[r >> 2] | 0) + -12) >> 2] | 0;
          }
          Zi((r + u) | 0, c[(r + (u + 16)) >> 2] | 1);
        }
      while (0);
      Qj(s);
      Fj(r);
      p = Tq(20) | 0;
      a: do
        if (!p) {
          while (1) {
            p = c[6860] | 0;
            c[6860] = p + 0;
            if (!p) break;
            qd[p & 3]();
            p = Tq(20) | 0;
            if (p) break a;
          }
          L = Wb(4) | 0;
          c[L >> 2] = 27280;
          Zc(L | 0, 27328, 220);
        }
      while (0);
      c[p >> 2] = e;
      c[(p + 4) >> 2] = f;
      c[(p + 8) >> 2] = 0;
      a[(p + 12) >> 0] = 0;
      a[(p + 13) >> 0] = 0;
      c[(p + 16) >> 2] = 0;
      e = Tq(16) | 0;
      b: do
        if (!e) {
          while (1) {
            f = c[6860] | 0;
            c[6860] = f + 0;
            if (!f) break;
            qd[f & 3]();
            e = Tq(16) | 0;
            if (e) break b;
          }
          L = Wb(4) | 0;
          c[L >> 2] = 27280;
          Zc(L | 0, 27328, 220);
        }
      while (0);
      c[(e + 4) >> 2] = 0;
      c[(e + 8) >> 2] = 0;
      c[e >> 2] = 12e3;
      c[(e + 12) >> 2] = p;
      c[b >> 2] = p;
      L = (b + 4) | 0;
      f = c[L >> 2] | 0;
      c[L >> 2] = e;
      if (f) {
        K = (f + 4) | 0;
        L = c[K >> 2] | 0;
        c[K >> 2] = L + -1;
        if (
          (L | 0) == 0
            ? (jd[c[((c[f >> 2] | 0) + 8) >> 2] & 255](f),
              (K = (f + 8) | 0),
              (L = c[K >> 2] | 0),
              (c[K >> 2] = L + -1),
              (L | 0) == 0)
            : 0
        )
          jd[c[((c[f >> 2] | 0) + 16) >> 2] & 255](f);
        p = c[b >> 2] | 0;
      }
      f = Tq(352) | 0;
      c: do
        if (!f) {
          while (1) {
            f = c[6860] | 0;
            c[6860] = f + 0;
            if (!f) break;
            qd[f & 3]();
            f = Tq(352) | 0;
            if (f) break c;
          }
          L = Wb(4) | 0;
          c[L >> 2] = 27280;
          Zc(L | 0, 27328, 220);
        }
      while (0);
      c[f >> 2] = p;
      c[(f + 4) >> 2] = p;
      e = (f + 8) | 0;
      c[e >> 2] = 0;
      p = (f + 12) | 0;
      c[p >> 2] = 0;
      w = Tq(1048644) | 0;
      x = (w + 68) & -64;
      c[(x + -4) >> 2] = w;
      c[(f + 16) >> 2] = x;
      x = (f + 279) | 0;
      a[x >> 0] = 0;
      a[(x + 1) >> 0] = 0;
      w = (f + 281) | 0;
      a[w >> 0] = 0;
      a[(w + 1) >> 0] = 0;
      a[(w + 2) >> 0] = 0;
      a[(w + 3) >> 0] = 0;
      t = (f + 288) | 0;
      r = (f + 292) | 0;
      v = (f + 300) | 0;
      u = (f + 304) | 0;
      F = (f + 344) | 0;
      D = (t + 0) | 0;
      E = (D + 56) | 0;
      do {
        c[D >> 2] = 0;
        D = (D + 4) | 0;
      } while ((D | 0) < (E | 0));
      D = F;
      c[D >> 2] = -1;
      c[(D + 4) >> 2] = -1;
      D = c[f >> 2] | 0;
      E = (D + 13) | 0;
      if (!(a[E >> 0] | 0)) {
        L = (D + 4) | 0;
        I = (D + 8) | 0;
        K = c[I >> 2] | 0;
        J = ((c[L >> 2] | 0) - K) | 0;
        J = (J | 0) < 4 ? J : 4;
        pr(C | 0, ((c[D >> 2] | 0) + K) | 0, J | 0) | 0;
        K = ((c[I >> 2] | 0) + J) | 0;
        c[I >> 2] = K;
        c[(D + 16) >> 2] = J;
        if ((K | 0) >= (c[L >> 2] | 0)) a[E >> 0] = 1;
      } else a[(D + 12) >> 0] = 1;
      a[B >> 0] = 8;
      a[(B + 1) >> 0] = a[C >> 0] | 0;
      a[(B + 2) >> 0] = a[(C + 1) >> 0] | 0;
      a[(B + 3) >> 0] = a[(C + 2) >> 0] | 0;
      a[(B + 4) >> 0] = a[(C + 3) >> 0] | 0;
      a[(B + (C + (4 - C)) + 1) >> 0] = 0;
      C = (Qi(B, 10088) | 0) == 0;
      if (a[B >> 0] & 1) Uq(c[(B + 8) >> 2] | 0);
      if (!C) {
        b = Wb(8) | 0;
        c[b >> 2] = 27520;
        g = (b + 4) | 0;
        j = Tq(36) | 0;
        d: do
          if (!j) {
            while (1) {
              j = c[6860] | 0;
              c[6860] = j + 0;
              if (!j) break;
              qd[j & 3]();
              j = Tq(36) | 0;
              if (j) break d;
            }
            L = Wb(4) | 0;
            c[L >> 2] = 27280;
            Zc(L | 0, 27328, 220);
          }
        while (0);
        c[j >> 2] = 23;
        c[(j + 4) >> 2] = 23;
        c[(j + 8) >> 2] = 0;
        j = (j + 12) | 0;
        D = (j + 0) | 0;
        y = 11664;
        E = (D + 24) | 0;
        do {
          a[D >> 0] = a[y >> 0] | 0;
          D = (D + 1) | 0;
          y = (y + 1) | 0;
        } while ((D | 0) < (E | 0));
        c[g >> 2] = j;
        c[b >> 2] = 11696;
        Zc(b | 0, 10128, 115);
      }
      B = c[f >> 2] | 0;
      if ((c[(B + 4) >> 2] | 0) > 0) c[(B + 8) >> 2] = 0;
      else a[(B + 12) >> 0] = 1;
      D = c[f >> 2] | 0;
      B = (f + 20) | 0;
      C = (D + 13) | 0;
      if (!(a[C >> 0] | 0)) {
        L = (D + 4) | 0;
        I = (D + 8) | 0;
        K = c[I >> 2] | 0;
        J = ((c[L >> 2] | 0) - K) | 0;
        J = (J | 0) < 227 ? J : 227;
        pr(B | 0, ((c[D >> 2] | 0) + K) | 0, J | 0) | 0;
        K = ((c[I >> 2] | 0) + J) | 0;
        c[I >> 2] = K;
        c[(D + 16) >> 2] = J;
        if ((K | 0) >= (c[L >> 2] | 0)) a[C >> 0] = 1;
      } else a[(D + 12) >> 0] = 1;
      F = (f + 199) | 0;
      a[k >> 0] = a[F >> 0];
      a[(k + 1) >> 0] = a[(F + 1) >> 0];
      a[(k + 2) >> 0] = a[(F + 2) >> 0];
      a[(k + 3) >> 0] = a[(F + 3) >> 0];
      a[(k + 4) >> 0] = a[(F + 4) >> 0];
      a[(k + 5) >> 0] = a[(F + 5) >> 0];
      a[(k + 6) >> 0] = a[(F + 6) >> 0];
      a[(k + 7) >> 0] = a[(F + 7) >> 0];
      Q = +h[k >> 3];
      I = (f + 207) | 0;
      a[k >> 0] = a[I >> 0];
      a[(k + 1) >> 0] = a[(I + 1) >> 0];
      a[(k + 2) >> 0] = a[(I + 2) >> 0];
      a[(k + 3) >> 0] = a[(I + 3) >> 0];
      a[(k + 4) >> 0] = a[(I + 4) >> 0];
      a[(k + 5) >> 0] = a[(I + 5) >> 0];
      a[(k + 6) >> 0] = a[(I + 6) >> 0];
      a[(k + 7) >> 0] = a[(I + 7) >> 0];
      R = +h[k >> 3];
      K = (f + 215) | 0;
      a[k >> 0] = a[K >> 0];
      a[(k + 1) >> 0] = a[(K + 1) >> 0];
      a[(k + 2) >> 0] = a[(K + 2) >> 0];
      a[(k + 3) >> 0] = a[(K + 3) >> 0];
      a[(k + 4) >> 0] = a[(K + 4) >> 0];
      a[(k + 5) >> 0] = a[(K + 5) >> 0];
      a[(k + 6) >> 0] = a[(K + 6) >> 0];
      a[(k + 7) >> 0] = a[(K + 7) >> 0];
      O = +h[k >> 3];
      G = (f + 223) | 0;
      a[k >> 0] = a[G >> 0];
      a[(k + 1) >> 0] = a[(G + 1) >> 0];
      a[(k + 2) >> 0] = a[(G + 2) >> 0];
      a[(k + 3) >> 0] = a[(G + 3) >> 0];
      a[(k + 4) >> 0] = a[(G + 4) >> 0];
      a[(k + 5) >> 0] = a[(G + 5) >> 0];
      a[(k + 6) >> 0] = a[(G + 6) >> 0];
      a[(k + 7) >> 0] = a[(G + 7) >> 0];
      P = +h[k >> 3];
      J = (f + 231) | 0;
      a[k >> 0] = a[J >> 0];
      a[(k + 1) >> 0] = a[(J + 1) >> 0];
      a[(k + 2) >> 0] = a[(J + 2) >> 0];
      a[(k + 3) >> 0] = a[(J + 3) >> 0];
      a[(k + 4) >> 0] = a[(J + 4) >> 0];
      a[(k + 5) >> 0] = a[(J + 5) >> 0];
      a[(k + 6) >> 0] = a[(J + 6) >> 0];
      a[(k + 7) >> 0] = a[(J + 7) >> 0];
      M = +h[k >> 3];
      L = (f + 239) | 0;
      a[k >> 0] = a[L >> 0];
      a[(k + 1) >> 0] = a[(L + 1) >> 0];
      a[(k + 2) >> 0] = a[(L + 2) >> 0];
      a[(k + 3) >> 0] = a[(L + 3) >> 0];
      a[(k + 4) >> 0] = a[(L + 4) >> 0];
      a[(k + 5) >> 0] = a[(L + 5) >> 0];
      a[(k + 6) >> 0] = a[(L + 6) >> 0];
      a[(k + 7) >> 0] = a[(L + 7) >> 0];
      N = +h[k >> 3];
      h[k >> 3] = R;
      a[F >> 0] = a[k >> 0];
      a[(F + 1) >> 0] = a[(k + 1) >> 0];
      a[(F + 2) >> 0] = a[(k + 2) >> 0];
      a[(F + 3) >> 0] = a[(k + 3) >> 0];
      a[(F + 4) >> 0] = a[(k + 4) >> 0];
      a[(F + 5) >> 0] = a[(k + 5) >> 0];
      a[(F + 6) >> 0] = a[(k + 6) >> 0];
      a[(F + 7) >> 0] = a[(k + 7) >> 0];
      h[k >> 3] = Q;
      a[G >> 0] = a[k >> 0];
      a[(G + 1) >> 0] = a[(k + 1) >> 0];
      a[(G + 2) >> 0] = a[(k + 2) >> 0];
      a[(G + 3) >> 0] = a[(k + 3) >> 0];
      a[(G + 4) >> 0] = a[(k + 4) >> 0];
      a[(G + 5) >> 0] = a[(k + 5) >> 0];
      a[(G + 6) >> 0] = a[(k + 6) >> 0];
      a[(G + 7) >> 0] = a[(k + 7) >> 0];
      h[k >> 3] = P;
      a[I >> 0] = a[k >> 0];
      a[(I + 1) >> 0] = a[(k + 1) >> 0];
      a[(I + 2) >> 0] = a[(k + 2) >> 0];
      a[(I + 3) >> 0] = a[(k + 3) >> 0];
      a[(I + 4) >> 0] = a[(k + 4) >> 0];
      a[(I + 5) >> 0] = a[(k + 5) >> 0];
      a[(I + 6) >> 0] = a[(k + 6) >> 0];
      a[(I + 7) >> 0] = a[(k + 7) >> 0];
      h[k >> 3] = O;
      a[J >> 0] = a[k >> 0];
      a[(J + 1) >> 0] = a[(k + 1) >> 0];
      a[(J + 2) >> 0] = a[(k + 2) >> 0];
      a[(J + 3) >> 0] = a[(k + 3) >> 0];
      a[(J + 4) >> 0] = a[(k + 4) >> 0];
      a[(J + 5) >> 0] = a[(k + 5) >> 0];
      a[(J + 6) >> 0] = a[(k + 6) >> 0];
      a[(J + 7) >> 0] = a[(k + 7) >> 0];
      h[k >> 3] = N;
      a[K >> 0] = a[k >> 0];
      a[(K + 1) >> 0] = a[(k + 1) >> 0];
      a[(K + 2) >> 0] = a[(k + 2) >> 0];
      a[(K + 3) >> 0] = a[(k + 3) >> 0];
      a[(K + 4) >> 0] = a[(k + 4) >> 0];
      a[(K + 5) >> 0] = a[(k + 5) >> 0];
      a[(K + 6) >> 0] = a[(k + 6) >> 0];
      a[(K + 7) >> 0] = a[(k + 7) >> 0];
      h[k >> 3] = M;
      a[L >> 0] = a[k >> 0];
      a[(L + 1) >> 0] = a[(k + 1) >> 0];
      a[(L + 2) >> 0] = a[(k + 2) >> 0];
      a[(L + 3) >> 0] = a[(k + 3) >> 0];
      a[(L + 4) >> 0] = a[(k + 4) >> 0];
      a[(L + 5) >> 0] = a[(k + 5) >> 0];
      a[(L + 6) >> 0] = a[(k + 6) >> 0];
      a[(L + 7) >> 0] = a[(k + 7) >> 0];
      if ((a[10976] | 0) == 0 ? (Fa(10976) | 0) != 0 : 0) {
        c[2740] = 0;
        c[2741] = 0;
        c[2742] = 0;
        eb(238, 10960, o | 0) | 0;
        Vc(10976);
      }
      if ((a[11008] | 0) == 0 ? (Fa(11008) | 0) != 0 : 0) {
        eb(239, 10984, o | 0) | 0;
        Vc(11008);
      }
      D = c[2740] | 0;
      C = c[2741] | 0;
      do
        if ((D | 0) == (C | 0)) {
          C = Cc(10984) | 0;
          if (C) {
            g = Wb(16) | 0;
            do
              if (!(a[15688] | 0)) {
                if (!(Fa(15688) | 0)) break;
                c[3920] = 15952;
                Vc(15688);
              }
            while (0);
            yi(g, C, 15680, 16040);
            Zc(g | 0, 15752, 133);
          }
          D = c[2740] | 0;
          do
            if ((D | 0) == (c[2741] | 0)) {
              C = (s + 16) | 0;
              c[C >> 2] = s;
              c[s >> 2] = 11024;
              E = c[2742] | 0;
              do
                if (D >>> 0 < E >>> 0) {
                  if (!D) D = 0;
                  else {
                    c[(D + 16) >> 2] = D;
                    L = c[C >> 2] | 0;
                    kd[c[((c[L >> 2] | 0) + 12) >> 2] & 63](L, D);
                    D = c[2741] | 0;
                  }
                  c[2741] = D + 24;
                } else {
                  D = (((E - D) | 0) / 24) | 0;
                  if (D >>> 0 < 89478485) {
                    D = D << 1;
                    D = (D | 0) == 0 ? 1 : D;
                  } else D = 178956970;
                  E = (D * 24) | 0;
                  E = (E | 0) == 0 ? 1 : E;
                  F = Tq(E) | 0;
                  e: do
                    if (!F) {
                      while (1) {
                        F = c[6860] | 0;
                        c[6860] = F + 0;
                        if (!F) break;
                        qd[F & 3]();
                        F = Tq(E) | 0;
                        if (F) break e;
                      }
                      L = Wb(4) | 0;
                      c[L >> 2] = 27280;
                      Zc(L | 0, 27328, 220);
                    }
                  while (0);
                  D = (F + ((D * 24) | 0)) | 0;
                  do
                    if (F) {
                      E = c[C >> 2] | 0;
                      if (!E) {
                        c[(F + 16) >> 2] = 0;
                        break;
                      }
                      if ((E | 0) == (s | 0)) {
                        c[(F + 16) >> 2] = F;
                        kd[c[((c[s >> 2] | 0) + 12) >> 2] & 63](s, F);
                        break;
                      } else {
                        c[(F + 16) >> 2] = E;
                        c[C >> 2] = 0;
                        break;
                      }
                    }
                  while (0);
                  E = (F + 24) | 0;
                  G = c[2740] | 0;
                  I = c[2741] | 0;
                  do
                    if ((I | 0) == (G | 0)) {
                      c[2740] = F;
                      c[2741] = E;
                      c[2742] = D;
                    } else {
                      do {
                        J = F;
                        F = (F + -24) | 0;
                        K = (I + -8) | 0;
                        I = (I + -24) | 0;
                        L = c[K >> 2] | 0;
                        do
                          if (L)
                            if ((L | 0) == (I | 0)) {
                              c[(J + -8) >> 2] = F;
                              L = c[K >> 2] | 0;
                              kd[c[((c[L >> 2] | 0) + 12) >> 2] & 63](L, F);
                              break;
                            } else {
                              c[(J + -8) >> 2] = L;
                              c[K >> 2] = 0;
                              break;
                            }
                          else c[(J + -8) >> 2] = 0;
                        while (0);
                      } while ((I | 0) != (G | 0));
                      G = c[2740] | 0;
                      I = c[2741] | 0;
                      c[2740] = F;
                      c[2741] = E;
                      c[2742] = D;
                      if ((I | 0) == (G | 0)) break;
                      do {
                        D = c[(I + -8) >> 2] | 0;
                        I = (I + -24) | 0;
                        do
                          if ((D | 0) == (I | 0)) jd[c[((c[D >> 2] | 0) + 16) >> 2] & 255](D);
                          else {
                            if (!D) break;
                            jd[c[((c[D >> 2] | 0) + 20) >> 2] & 255](D);
                          }
                        while (0);
                      } while ((I | 0) != (G | 0));
                    }
                  while (0);
                  if (!G) break;
                  Uq(G);
                }
              while (0);
              C = c[C >> 2] | 0;
              if ((C | 0) == (s | 0)) {
                jd[c[((c[s >> 2] | 0) + 16) >> 2] & 255](s);
                break;
              }
              if (!C) break;
              jd[c[((c[C >> 2] | 0) + 20) >> 2] & 255](C);
            }
          while (0);
          if (!(zb(10984) | 0)) {
            A = c[2740] | 0;
            z = c[2741] | 0;
            break;
          }
          Ha(16064, 16072, 47, 16144);
        } else {
          A = D;
          z = C;
        }
      while (0);
      f: do
        if ((A | 0) != (z | 0)) {
          C = (y + 16) | 0;
          while (1) {
            D = (A + 16) | 0;
            E = c[D >> 2] | 0;
            if (!E) {
              n = 148;
              break;
            }
            if ((E | 0) == (A | 0)) {
              c[C >> 2] = y;
              D = c[D >> 2] | 0;
              kd[c[((c[D >> 2] | 0) + 12) >> 2] & 63](D, y);
              D = c[C >> 2] | 0;
            } else {
              D = md[c[((c[E >> 2] | 0) + 8) >> 2] & 127](E) | 0;
              c[C >> 2] = D;
            }
            if (!D) break;
            kd[c[((c[D >> 2] | 0) + 24) >> 2] & 63](D, B);
            D = c[C >> 2] | 0;
            do
              if ((D | 0) == (y | 0)) jd[c[((c[y >> 2] | 0) + 16) >> 2] & 255](y);
              else {
                if (!D) break;
                jd[c[((c[D >> 2] | 0) + 20) >> 2] & 255](D);
              }
            while (0);
            A = (A + 24) | 0;
            if ((A | 0) == (z | 0)) break f;
          }
          if ((n | 0) == 148) c[C >> 2] = 0;
          L = Wb(4) | 0;
          c[L >> 2] = 10944;
          Zc(L | 0, 10920, 105);
        }
      while (0);
      y = c[f >> 2] | 0;
      z = (f + 114) | 0;
      z = d[z >> 0] | (d[(z + 1) >> 0] << 8);
      L = c[(y + 4) >> 2] | 0;
      K = (((L | 0) < 0) << 31) >> 31;
      if ((0 < (K | 0)) | ((0 == (K | 0)) & ((z & 65535) >>> 0 < L >>> 0)))
        c[(y + 8) >> 2] = z & 65535;
      else a[(y + 12) >> 0] = 1;
      A = (f + 120) | 0;
      g: do
        if (
          d[A >> 0] |
          (d[(A + 1) >> 0] << 8) |
          (d[(A + 2) >> 0] << 16) |
          (d[(A + 3) >> 0] << 24)
        ) {
          z = (s + 2) | 0;
          D = (s + 16) | 0;
          C = (s + 18) | 0;
          B = (s + 20) | 0;
          y = 0;
          while (1) {
            K = ((c[f >> 2] | 0) + 12) | 0;
            L = a[K >> 0] | 0;
            a[K >> 0] = 0;
            if ((L << 24) >> 24) break g;
            F = c[f >> 2] | 0;
            E = (F + 13) | 0;
            if (a[E >> 0] | 0) break g;
            L = (F + 4) | 0;
            I = (F + 8) | 0;
            K = c[I >> 2] | 0;
            J = ((c[L >> 2] | 0) - K) | 0;
            J = (J | 0) < 54 ? J : 54;
            pr(s | 0, ((c[F >> 2] | 0) + K) | 0, J | 0) | 0;
            K = ((c[I >> 2] | 0) + J) | 0;
            c[I >> 2] = K;
            c[(F + 16) >> 2] = J;
            if ((K | 0) < (c[L >> 2] | 0)) {
              F = z;
              E = 10616;
            } else {
              a[E >> 0] = 1;
              F = z;
              E = 10616;
            }
            while (1) {
              if ((a[F >> 0] | 0) != (a[E >> 0] | 0)) break;
              F = (F + 1) | 0;
              if ((F | 0) == (D | 0)) {
                n = 174;
                break;
              } else E = (E + 1) | 0;
            }
            if (
              (n | 0) == 174
                ? ((n = 0), ((d[C >> 0] | (d[(C + 1) >> 0] << 8)) << 16) >> 16 == 22204)
                : 0
            )
              break;
            E = c[f >> 2] | 0;
            G = (E + 8) | 0;
            F = c[G >> 2] | 0;
            F =
              kr(
                F | 0,
                ((((F | 0) < 0) << 31) >> 31) | 0,
                ((d[B >> 0] | (d[(B + 1) >> 0] << 8)) & 65535) | 0,
                0
              ) | 0;
            L = H;
            K = c[(E + 4) >> 2] | 0;
            J = (((K | 0) < 0) << 31) >> 31;
            E = (E + 12) | 0;
            if (((L | 0) > (J | 0)) | (((L | 0) == (J | 0)) & (F >>> 0 >= K >>> 0)) | ((L | 0) < 0))
              a[E >> 0] = 1;
            else {
              a[E >> 0] = 0;
              c[G >> 2] = F;
            }
            y = (y + 1) | 0;
            if (
              y >>> 0 >=
              (d[A >> 0] |
                (d[(A + 1) >> 0] << 8) |
                (d[(A + 2) >> 0] << 16) |
                (d[(A + 3) >> 0] << 24)) >>>
                0
            )
              break g;
          }
          A = d[B >> 0] | (d[(B + 1) >> 0] << 8);
          y = A & 65535;
          A = (A << 16) >> 16 == 0 ? 1 : y;
          z = Tq(A) | 0;
          h: do
            if (!z) {
              while (1) {
                z = c[6860] | 0;
                c[6860] = z + 0;
                if (!z) break;
                qd[z & 3]();
                z = Tq(A) | 0;
                if (z) break h;
              }
              L = Wb(4) | 0;
              c[L >> 2] = 27280;
              Zc(L | 0, 27328, 220);
            }
          while (0);
          A = c[f >> 2] | 0;
          B = (A + 13) | 0;
          do
            if (!(a[B >> 0] | 0)) {
              L = (A + 4) | 0;
              I = (A + 8) | 0;
              K = c[I >> 2] | 0;
              J = ((c[L >> 2] | 0) - K) | 0;
              J = (J | 0) < (y | 0) ? J : y;
              pr(z | 0, ((c[A >> 2] | 0) + K) | 0, J | 0) | 0;
              K = ((c[I >> 2] | 0) + J) | 0;
              c[I >> 2] = K;
              c[(A + 16) >> 2] = J;
              if ((K | 0) < (c[L >> 2] | 0)) break;
              a[B >> 0] = 1;
            } else a[(A + 12) >> 0] = 1;
          while (0);
          A = (f + 247) | 0;
          D = (A + 0) | 0;
          y = (z + 0) | 0;
          E = (D + 34) | 0;
          do {
            a[D >> 0] = a[y >> 0] | 0;
            D = (D + 1) | 0;
            y = (y + 1) | 0;
          } while ((D | 0) < (E | 0));
          if (((d[A >> 0] | (d[(A + 1) >> 0] << 8)) << 16) >> 16 != 2) {
            b = Wb(8) | 0;
            c[b >> 2] = 27520;
            g = (b + 4) | 0;
            j = Tq(68) | 0;
            i: do
              if (!j) {
                while (1) {
                  j = c[6860] | 0;
                  c[6860] = j + 0;
                  if (!j) break;
                  qd[j & 3]();
                  j = Tq(68) | 0;
                  if (j) break i;
                }
                L = Wb(4) | 0;
                c[L >> 2] = 27280;
                Zc(L | 0, 27328, 220);
              }
            while (0);
            c[j >> 2] = 55;
            c[(j + 4) >> 2] = 55;
            c[(j + 8) >> 2] = 0;
            j = (j + 12) | 0;
            D = (j + 0) | 0;
            y = 10808;
            E = (D + 56) | 0;
            do {
              a[D >> 0] = a[y >> 0] | 0;
              D = (D + 1) | 0;
              y = (y + 1) | 0;
            } while ((D | 0) < (E | 0));
            c[g >> 2] = j;
            c[b >> 2] = 10872;
            Zc(b | 0, 10792, 103);
          }
          y = d[x >> 0] | (d[(x + 1) >> 0] << 8);
          A = ((y & 65535) * 6) | 0;
          A = (A | 0) == 0 ? 1 : A;
          B = Tq(A) | 0;
          j: do
            if (!B) {
              while (1) {
                B = c[6860] | 0;
                c[6860] = B + 0;
                if (!B) break;
                qd[B & 3]();
                B = Tq(A) | 0;
                if (B) break j;
              }
              L = Wb(4) | 0;
              c[L >> 2] = 27280;
              Zc(L | 0, 27328, 220);
            }
          while (0);
          a[w >> 0] = B;
          a[(w + 1) >> 0] = B >> 8;
          a[(w + 2) >> 0] = B >> 16;
          a[(w + 3) >> 0] = B >> 24;
          k: do
            if (!((y << 16) >> 16)) B = 0;
            else {
              A = (z + 34) | 0;
              a[(B + 0) >> 0] = a[(A + 0) >> 0] | 0;
              a[(B + 1) >> 0] = a[(A + 1) >> 0] | 0;
              a[(B + 2) >> 0] = a[(A + 2) >> 0] | 0;
              a[(B + 3) >> 0] = a[(A + 3) >> 0] | 0;
              a[(B + 4) >> 0] = a[(A + 4) >> 0] | 0;
              a[(B + 5) >> 0] = a[(A + 5) >> 0] | 0;
              if ((y & 65535) > 1) y = 1;
              else {
                B = 1;
                break;
              }
              while (1) {
                A = (A + 6) | 0;
                pr((B + ((y * 6) | 0)) | 0, A | 0, 6) | 0;
                y = (y + 1) | 0;
                B = d[x >> 0] | (d[(x + 1) >> 0] << 8);
                if ((y | 0) >= ((B & 65535) | 0)) break k;
                B =
                  d[w >> 0] |
                  (d[(w + 1) >> 0] << 8) |
                  (d[(w + 2) >> 0] << 16) |
                  (d[(w + 3) >> 0] << 24);
              }
            }
          while (0);
          if (z) {
            Uq(z);
            B = d[x >> 0] | (d[(x + 1) >> 0] << 8);
          }
          l: do
            if ((B << 16) >> 16) {
              y = (f + 308) | 0;
              z = 0;
              m: while (1) {
                D =
                  d[w >> 0] |
                  (d[(w + 1) >> 0] << 8) |
                  (d[(w + 2) >> 0] << 16) |
                  (d[(w + 3) >> 0] << 24);
                C = (D + ((z * 6) | 0)) | 0;
                C = (d[C >> 0] | (d[(C + 1) >> 0] << 8)) & 65535;
                A = (D + ((z * 6) | 0) + 2) | 0;
                A = (d[A >> 0] | (d[(A + 1) >> 0] << 8)) & 65535;
                D = (D + ((z * 6) | 0) + 4) | 0;
                D = (d[D >> 0] | (d[(D + 1) >> 0] << 8)) & 65535;
                E = c[u >> 2] | 0;
                do
                  if ((E | 0) == (c[y >> 2] | 0)) {
                    B = c[v >> 2] | 0;
                    F = (E - B) | 0;
                    G = ((F | 0) / 12) | 0;
                    E = (G + 1) | 0;
                    if (E >>> 0 > 357913941) {
                      n = 225;
                      break m;
                    }
                    if (G >>> 0 < 178956970) {
                      I = G << 1;
                      I = I >>> 0 < E >>> 0 ? E : I;
                      if (!I) {
                        I = 0;
                        K = 0;
                      } else n = 229;
                    } else {
                      I = 357913941;
                      n = 229;
                    }
                    if ((n | 0) == 229) {
                      n = 0;
                      J = (I * 12) | 0;
                      J = (J | 0) == 0 ? 1 : J;
                      K = Tq(J) | 0;
                      if (!K)
                        do {
                          K = c[6860] | 0;
                          c[6860] = K + 0;
                          if (!K) {
                            n = 233;
                            break m;
                          }
                          qd[K & 3]();
                          K = Tq(J) | 0;
                        } while ((K | 0) == 0);
                    }
                    J = (K + ((G * 12) | 0)) | 0;
                    if (J) {
                      c[J >> 2] = C;
                      c[(K + ((G * 12) | 0) + 4) >> 2] = A;
                      c[(K + ((G * 12) | 0) + 8) >> 2] = D;
                    }
                    L = (K + (((((((F | 0) / -12) | 0) + G) | 0) * 12) | 0)) | 0;
                    nr(L | 0, B | 0, F | 0) | 0;
                    c[v >> 2] = L;
                    c[u >> 2] = K + ((E * 12) | 0);
                    c[y >> 2] = K + ((I * 12) | 0);
                    if (!B) break;
                    Uq(B);
                  } else {
                    if (!E) A = 0;
                    else {
                      c[E >> 2] = C;
                      c[(E + 4) >> 2] = A;
                      c[(E + 8) >> 2] = D;
                      A = c[u >> 2] | 0;
                    }
                    c[u >> 2] = A + 12;
                  }
                while (0);
                z = (z + 1) | 0;
                if ((z | 0) >= (((d[x >> 0] | (d[(x + 1) >> 0] << 8)) & 65535) | 0)) break l;
              }
              if ((n | 0) == 225) Mn();
              else if ((n | 0) == 233) {
                L = Wb(4) | 0;
                c[L >> 2] = 27280;
                Zc(L | 0, 27328, 220);
              }
            }
          while (0);
          w = c[f >> 2] | 0;
          u = (f + 116) | 0;
          v =
            d[u >> 0] | (d[(u + 1) >> 0] << 8) | (d[(u + 2) >> 0] << 16) | (d[(u + 3) >> 0] << 24);
          L = c[(w + 4) >> 2] | 0;
          K = (((L | 0) < 0) << 31) >> 31;
          if ((0 < (K | 0)) | ((0 == (K | 0)) & (v >>> 0 < L >>> 0))) c[(w + 8) >> 2] = v;
          else a[(w + 12) >> 0] = 1;
          w = s;
          c[w >> 2] = 0;
          c[(w + 4) >> 2] = 0;
          w = c[f >> 2] | 0;
          v = (w + 13) | 0;
          do
            if (!(a[v >> 0] | 0)) {
              L = c[(w + 4) >> 2] | 0;
              I = (w + 8) | 0;
              K = c[I >> 2] | 0;
              J = (L - K) | 0;
              J = (J | 0) < 8 ? J : 8;
              nr(s | 0, ((c[w >> 2] | 0) + K) | 0, J | 0) | 0;
              K = (K + J) | 0;
              c[I >> 2] = K;
              c[(w + 16) >> 2] = J;
              if ((K | 0) < (L | 0)) break;
              a[v >> 0] = 1;
            } else a[(w + 12) >> 0] = 1;
          while (0);
          K = ((c[f >> 2] | 0) + 12) | 0;
          L = a[K >> 0] | 0;
          a[K >> 0] = 0;
          if ((L << 24) >> 24) {
            g = Wb(8) | 0;
            c[g >> 2] = 27520;
            b = (g + 4) | 0;
            j = Tq(56) | 0;
            n: do
              if (!j) {
                while (1) {
                  j = c[6860] | 0;
                  c[6860] = j + 0;
                  if (!j) break;
                  qd[j & 3]();
                  j = Tq(56) | 0;
                  if (j) break n;
                }
                L = Wb(4) | 0;
                c[L >> 2] = 27280;
                Zc(L | 0, 27328, 220);
              }
            while (0);
            c[j >> 2] = 43;
            c[(j + 4) >> 2] = 43;
            c[(j + 8) >> 2] = 0;
            j = (j + 12) | 0;
            D = (j + 0) | 0;
            y = 10544;
            E = (D + 44) | 0;
            do {
              a[D >> 0] = a[y >> 0] | 0;
              D = (D + 1) | 0;
              y = (y + 1) | 0;
            } while ((D | 0) < (E | 0));
            c[b >> 2] = j;
            c[g >> 2] = 10600;
            Zc(g | 0, 10184, 99);
          }
          v = s;
          w = c[v >> 2] | 0;
          v = c[(v + 4) >> 2] | 0;
          if (((w | 0) == -1) & ((v | 0) == -1)) {
            g = Wb(8) | 0;
            c[g >> 2] = 27520;
            b = (g + 4) | 0;
            j = Tq(67) | 0;
            o: do
              if (!j) {
                while (1) {
                  j = c[6860] | 0;
                  c[6860] = j + 0;
                  if (!j) break;
                  qd[j & 3]();
                  j = Tq(67) | 0;
                  if (j) break o;
                }
                L = Wb(4) | 0;
                c[L >> 2] = 27280;
                Zc(L | 0, 27328, 220);
              }
            while (0);
            c[j >> 2] = 54;
            c[(j + 4) >> 2] = 54;
            c[(j + 8) >> 2] = 0;
            j = (j + 12) | 0;
            D = (j + 0) | 0;
            y = 10200;
            E = (D + 55) | 0;
            do {
              a[D >> 0] = a[y >> 0] | 0;
              D = (D + 1) | 0;
              y = (y + 1) | 0;
            } while ((D | 0) < (E | 0));
            c[b >> 2] = j;
            c[g >> 2] = 10528;
            Zc(g | 0, 10288, 97);
          }
          s = c[f >> 2] | 0;
          L = c[(s + 4) >> 2] | 0;
          K = (((L | 0) < 0) << 31) >> 31;
          if (((v | 0) < (K | 0)) | (((v | 0) == (K | 0)) & (w >>> 0 < L >>> 0)))
            c[(s + 8) >> 2] = w;
          else a[(s + 12) >> 0] = 1;
          K = ((c[f >> 2] | 0) + 12) | 0;
          L = a[K >> 0] | 0;
          a[K >> 0] = 0;
          if ((L << 24) >> 24) {
            g = Wb(8) | 0;
            c[g >> 2] = 27520;
            b = (g + 4) | 0;
            j = Tq(56) | 0;
            p: do
              if (!j) {
                while (1) {
                  j = c[6860] | 0;
                  c[6860] = j + 0;
                  if (!j) break;
                  qd[j & 3]();
                  j = Tq(56) | 0;
                  if (j) break p;
                }
                L = Wb(4) | 0;
                c[L >> 2] = 27280;
                Zc(L | 0, 27328, 220);
              }
            while (0);
            c[j >> 2] = 43;
            c[(j + 4) >> 2] = 43;
            c[(j + 8) >> 2] = 0;
            j = (j + 12) | 0;
            D = (j + 0) | 0;
            y = 10544;
            E = (D + 44) | 0;
            do {
              a[D >> 0] = a[y >> 0] | 0;
              D = (D + 1) | 0;
              y = (y + 1) | 0;
            } while ((D | 0) < (E | 0));
            c[b >> 2] = j;
            c[g >> 2] = 10600;
            Zc(g | 0, 10184, 99);
          }
          s = c[f >> 2] | 0;
          v = (s + 13) | 0;
          do
            if (!(a[v >> 0] | 0)) {
              L = c[(s + 4) >> 2] | 0;
              I = (s + 8) | 0;
              K = c[I >> 2] | 0;
              J = (L - K) | 0;
              J = (J | 0) < 8 ? J : 8;
              nr(q | 0, ((c[s >> 2] | 0) + K) | 0, J | 0) | 0;
              K = (K + J) | 0;
              c[I >> 2] = K;
              c[(s + 16) >> 2] = J;
              if ((K | 0) < (L | 0)) break;
              a[v >> 0] = 1;
            } else a[(s + 12) >> 0] = 1;
          while (0);
          K = ((c[f >> 2] | 0) + 12) | 0;
          L = a[K >> 0] | 0;
          a[K >> 0] = 0;
          if ((L << 24) >> 24) {
            b = Wb(8) | 0;
            c[b >> 2] = 27520;
            g = (b + 4) | 0;
            j = Tq(56) | 0;
            q: do
              if (!j) {
                while (1) {
                  j = c[6860] | 0;
                  c[6860] = j + 0;
                  if (!j) break;
                  qd[j & 3]();
                  j = Tq(56) | 0;
                  if (j) break q;
                }
                L = Wb(4) | 0;
                c[L >> 2] = 27280;
                Zc(L | 0, 27328, 220);
              }
            while (0);
            c[j >> 2] = 43;
            c[(j + 4) >> 2] = 43;
            c[(j + 8) >> 2] = 0;
            j = (j + 12) | 0;
            D = (j + 0) | 0;
            y = 10544;
            E = (D + 44) | 0;
            do {
              a[D >> 0] = a[y >> 0] | 0;
              D = (D + 1) | 0;
              y = (y + 1) | 0;
            } while ((D | 0) < (E | 0));
            c[g >> 2] = j;
            c[b >> 2] = 10600;
            Zc(b | 0, 10184, 99);
          }
          if (c[q >> 2] | 0) {
            g = Wb(8) | 0;
            c[g >> 2] = 27520;
            b = (g + 4) | 0;
            j = Tq(54) | 0;
            r: do
              if (!j) {
                while (1) {
                  j = c[6860] | 0;
                  c[6860] = j + 0;
                  if (!j) break;
                  qd[j & 3]();
                  j = Tq(54) | 0;
                  if (j) break r;
                }
                L = Wb(4) | 0;
                c[L >> 2] = 27280;
                Zc(L | 0, 27328, 220);
              }
            while (0);
            c[j >> 2] = 41;
            c[(j + 4) >> 2] = 41;
            c[(j + 8) >> 2] = 0;
            j = (j + 12) | 0;
            D = (j + 0) | 0;
            y = 10448;
            E = (D + 42) | 0;
            do {
              a[D >> 0] = a[y >> 0] | 0;
              D = (D + 1) | 0;
              y = (y + 1) | 0;
            } while ((D | 0) < (E | 0));
            c[b >> 2] = j;
            c[g >> 2] = 10504;
            Zc(g | 0, 10344, 95);
          }
          s = c[t >> 2] | 0;
          v = c[r >> 2] | 0;
          if ((v | 0) == (s | 0)) y = s;
          else {
            y = (v + (~(((v + -8 + (0 - s)) | 0) >>> 3) << 3)) | 0;
            c[r >> 2] = y;
          }
          L = (f + 259) | 0;
          if (
            (d[L >> 0] |
              (d[(L + 1) >> 0] << 8) |
              (d[(L + 2) >> 0] << 16) |
              (d[(L + 3) >> 0] << 24) |
              0) ==
            -1
          ) {
            b = Wb(8) | 0;
            c[b >> 2] = 27520;
            g = (b + 4) | 0;
            j = Tq(96) | 0;
            s: do
              if (!j) {
                while (1) {
                  j = c[6860] | 0;
                  c[6860] = j + 0;
                  if (!j) break;
                  qd[j & 3]();
                  j = Tq(96) | 0;
                  if (j) break s;
                }
                L = Wb(4) | 0;
                c[L >> 2] = 27280;
                Zc(L | 0, 27328, 220);
              }
            while (0);
            c[j >> 2] = 83;
            c[(j + 4) >> 2] = 83;
            c[(j + 8) >> 2] = 0;
            j = (j + 12) | 0;
            D = (j + 0) | 0;
            y = 10360;
            E = (D + 84) | 0;
            do {
              a[D >> 0] = a[y >> 0] | 0;
              D = (D + 1) | 0;
              y = (y + 1) | 0;
            } while ((D | 0) < (E | 0));
            c[g >> 2] = j;
            c[b >> 2] = 10528;
            Zc(b | 0, 10288, 97);
          }
          q = (q + 4) | 0;
          v = c[q >> 2] | 0;
          w = (v + 1) | 0;
          B = s;
          x = (y - B) >> 3;
          do
            if (x >>> 0 < w >>> 0) {
              x = (w - x) | 0;
              w = (f + 296) | 0;
              C = c[w >> 2] | 0;
              z = y;
              if (((C - z) >> 3) >>> 0 >= x >>> 0) {
                n = x;
                w = y;
                while (1) {
                  if (w) {
                    L = w;
                    c[L >> 2] = 0;
                    c[(L + 4) >> 2] = 0;
                  }
                  n = (n + -1) | 0;
                  if (!n) break;
                  else w = (w + 8) | 0;
                }
                c[r >> 2] = y + (x << 3);
                break;
              }
              z = (z - B) | 0;
              A = z >> 3;
              y = (A + x) | 0;
              if (y >>> 0 > 536870911) Mn();
              B = (C - B) | 0;
              if ((B >> 3) >>> 0 < 268435455) {
                B = B >> 2;
                B = B >>> 0 < y >>> 0 ? y : B;
                if (!B) {
                  B = 0;
                  C = 0;
                } else n = 322;
              } else {
                B = 536870911;
                n = 322;
              }
              if ((n | 0) == 322) {
                n = B << 3;
                n = (n | 0) == 0 ? 1 : n;
                C = Tq(n) | 0;
                t: do
                  if (!C) {
                    while (1) {
                      C = c[6860] | 0;
                      c[6860] = C + 0;
                      if (!C) break;
                      qd[C & 3]();
                      C = Tq(n) | 0;
                      if (C) break t;
                    }
                    L = Wb(4) | 0;
                    c[L >> 2] = 27280;
                    Zc(L | 0, 27328, 220);
                  }
                while (0);
              }
              n = (C + (A << 3)) | 0;
              while (1) {
                if (n) {
                  L = n;
                  c[L >> 2] = 0;
                  c[(L + 4) >> 2] = 0;
                }
                x = (x + -1) | 0;
                if (!x) break;
                else n = (n + 8) | 0;
              }
              nr(C | 0, s | 0, z | 0) | 0;
              c[t >> 2] = C;
              c[r >> 2] = C + (y << 3);
              c[w >> 2] = C + (B << 3);
              if (!s) {
                s = C;
                break;
              }
              Uq(s);
              s = c[t >> 2] | 0;
            } else {
              if (x >>> 0 <= w >>> 0) break;
              n = (s + (w << 3)) | 0;
              if ((y | 0) == (n | 0)) break;
              c[r >> 2] = y + (~(((y + -8 + (0 - n)) | 0) >>> 3) << 3);
            }
          while (0);
          L = s;
          c[L >> 2] =
            (d[u >> 0] |
              (d[(u + 1) >> 0] << 8) |
              (d[(u + 2) >> 0] << 16) |
              (d[(u + 3) >> 0] << 24)) +
            8;
          c[(L + 4) >> 2] = 0;
          if (v >>> 0 > 1) {
            c[m >> 2] = c[f >> 2];
            c[(m + 4) >> 2] = 0;
            c[(m + 8) >> 2] = 0;
            n = (m + 12) | 0;
            v = Tq(1048644) | 0;
            L = (v + 68) & -64;
            c[(L + -4) >> 2] = v;
            c[n >> 2] = L;
            c[j >> 2] = m;
            L = (j + 4) | 0;
            c[L >> 2] = 0;
            c[(j + 8) >> 2] = -1;
            c[(l + 4) >> 2] = 32;
            c[(l + 8) >> 2] = 2;
            c[(l + 12) >> 2] = 8;
            c[(l + 16) >> 2] = 0;
            v = (l + 36) | 0;
            c[v >> 2] = 0;
            s = (l + 40) | 0;
            c[s >> 2] = 0;
            c[(l + 44) >> 2] = 0;
            c[(l + 60) >> 2] = 1;
            c[(l + 64) >> 2] = 2;
            c[(l + 56) >> 2] = 4096;
            c[(l + 52) >> 2] = 4;
            c[(l + 48) >> 2] = 4;
            w = (l + 68) | 0;
            c[w >> 2] = 0;
            x = (l + 72) | 0;
            c[x >> 2] = 0;
            c[(l + 76) >> 2] = 0;
            c[(l + 20) >> 2] = 32;
            y = (l + 24) | 0;
            c[y >> 2] = 0;
            c[(l + 28) >> 2] = -2147483648;
            c[(l + 32) >> 2] = 2147483647;
            c[l >> 2] = 0;
            J = Wf(m) | 0;
            I = Wf(m) | 0;
            K = Wf(m) | 0;
            c[L >> 2] =
              ((I & 255) << 16) | ((J & 255) << 24) | ((K & 255) << 8) | ((Wf(m) | 0) & 255);
            ge(l);
            m = c[q >> 2] | 0;
            if (!m) A = c[t >> 2] | 0;
            else {
              q = 1;
              do {
                if (q >>> 0 > 1) z = c[((c[t >> 2] | 0) + ((q + -1) << 3)) >> 2] | 0;
                else z = 0;
                A = (($f(l, j, ((c[v >> 2] | 0) + 44) | 0) | 0) + z) | 0;
                z = c[y >> 2] | 0;
                if ((A | 0) < 0) z = (z + A) | 0;
                else z = (A - (A >>> 0 < z >>> 0 ? 0 : z)) | 0;
                A = c[t >> 2] | 0;
                L = (A + (q << 3)) | 0;
                c[L >> 2] = z;
                c[(L + 4) >> 2] = (((z | 0) < 0) << 31) >> 31;
                q = (q + 1) | 0;
              } while (q >>> 0 <= m >>> 0);
            }
            j = ((c[r >> 2] | 0) - A) >> 3;
            if (j >>> 0 > 1) {
              m = A;
              l = c[m >> 2] | 0;
              m = c[(m + 4) >> 2] | 0;
              q = 1;
              do {
                L = (A + (q << 3)) | 0;
                K = L;
                l = kr(c[K >> 2] | 0, c[(K + 4) >> 2] | 0, l | 0, m | 0) | 0;
                m = H;
                c[L >> 2] = l;
                c[(L + 4) >> 2] = m;
                q = (q + 1) | 0;
              } while (q >>> 0 < j >>> 0);
            }
            j = c[w >> 2] | 0;
            if (j) {
              l = c[x >> 2] | 0;
              if ((l | 0) != (j | 0)) {
                do {
                  c[x >> 2] = l + -44;
                  m = c[(l + -36) >> 2] | 0;
                  if (m) Uq(c[(m + -4) >> 2] | 0);
                  m = c[(l + -32) >> 2] | 0;
                  if (m) Uq(c[(m + -4) >> 2] | 0);
                  l = c[(l + -28) >> 2] | 0;
                  if (l) Uq(c[(l + -4) >> 2] | 0);
                  l = c[x >> 2] | 0;
                } while ((l | 0) != (j | 0));
                j = c[w >> 2] | 0;
              }
              Uq(j);
            }
            j = c[v >> 2] | 0;
            if (j) {
              l = c[s >> 2] | 0;
              if ((l | 0) != (j | 0)) {
                do {
                  c[s >> 2] = l + -44;
                  m = c[(l + -36) >> 2] | 0;
                  if (m) Uq(c[(m + -4) >> 2] | 0);
                  m = c[(l + -32) >> 2] | 0;
                  if (m) Uq(c[(m + -4) >> 2] | 0);
                  l = c[(l + -28) >> 2] | 0;
                  if (l) Uq(c[(l + -4) >> 2] | 0);
                  l = c[s >> 2] | 0;
                } while ((l | 0) != (j | 0));
                j = c[v >> 2] | 0;
              }
              Uq(j);
            }
            Uq(c[((c[n >> 2] | 0) + -4) >> 2] | 0);
          }
          j = c[f >> 2] | 0;
          a[(j + 12) >> 0] = 0;
          a[(j + 13) >> 0] = 0;
          j = c[f >> 2] | 0;
          l =
            ((d[u >> 0] |
              (d[(u + 1) >> 0] << 8) |
              (d[(u + 2) >> 0] << 16) |
              (d[(u + 3) >> 0] << 24)) +
              8) |
            0;
          L = c[(j + 4) >> 2] | 0;
          K = (((L | 0) < 0) << 31) >> 31;
          if ((0 < (K | 0)) | ((0 == (K | 0)) & (l >>> 0 < L >>> 0))) c[(j + 8) >> 2] = l;
          else a[(j + 12) >> 0] = 1;
          c[p >> 2] = 0;
          c[e >> 2] = 0;
          j = Tq(16) | 0;
          u: do
            if (!j) {
              while (1) {
                j = c[6860] | 0;
                c[6860] = j + 0;
                if (!j) break;
                qd[j & 3]();
                j = Tq(16) | 0;
                if (j) break u;
              }
              L = Wb(4) | 0;
              c[L >> 2] = 27280;
              Zc(L | 0, 27328, 220);
            }
          while (0);
          c[(j + 4) >> 2] = 0;
          c[(j + 8) >> 2] = 0;
          c[j >> 2] = 11720;
          c[(j + 12) >> 2] = f;
          c[(b + 8) >> 2] = f;
          L = (b + 12) | 0;
          b = c[L >> 2] | 0;
          c[L >> 2] = j;
          if (!b) {
            i = g;
            return;
          }
          K = (b + 4) | 0;
          L = c[K >> 2] | 0;
          c[K >> 2] = L + -1;
          if (L) {
            i = g;
            return;
          }
          jd[c[((c[b >> 2] | 0) + 8) >> 2] & 255](b);
          K = (b + 8) | 0;
          L = c[K >> 2] | 0;
          c[K >> 2] = L + -1;
          if (L) {
            i = g;
            return;
          }
          jd[c[((c[b >> 2] | 0) + 16) >> 2] & 255](b);
          i = g;
          return;
        }
      while (0);
      g = Wb(8) | 0;
      c[g >> 2] = 27520;
      b = (g + 4) | 0;
      j = Tq(56) | 0;
      v: do
        if (!j) {
          while (1) {
            j = c[6860] | 0;
            c[6860] = j + 0;
            if (!j) break;
            qd[j & 3]();
            j = Tq(56) | 0;
            if (j) break v;
          }
          L = Wb(4) | 0;
          c[L >> 2] = 27280;
          Zc(L | 0, 27328, 220);
        }
      while (0);
      c[j >> 2] = 43;
      c[(j + 4) >> 2] = 43;
      c[(j + 8) >> 2] = 0;
      j = (j + 12) | 0;
      D = (j + 0) | 0;
      y = 10680;
      E = (D + 44) | 0;
      do {
        a[D >> 0] = a[y >> 0] | 0;
        D = (D + 1) | 0;
        y = (y + 1) | 0;
      } while ((D | 0) < (E | 0));
      c[b >> 2] = j;
      c[g >> 2] = 10736;
      Zc(g | 0, 10664, 101);
    }
    L = Wb(4) | 0;
    c[L >> 2] = 27744;
    Zc(L | 0, 27816, 228);
  }
  function Hd(b, e) {
    b = b | 0;
    e = e | 0;
    var f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0,
      y = 0,
      z = 0;
    f = i;
    i = (i + 176) | 0;
    r = (f + 160) | 0;
    m = (f + 16) | 0;
    g = f;
    b = c[(b + 8) >> 2] | 0;
    j = (b + 336) | 0;
    x = j;
    y = (b + 259) | 0;
    h = (b + 320) | 0;
    if (
      (!((c[(x + 4) >> 2] | 0) == 0
        ? (c[x >> 2] | 0) ==
          (d[y >> 0] |
            (d[(y + 1) >> 0] << 8) |
            (d[(y + 2) >> 0] << 16) |
            (d[(y + 3) >> 0] << 24) |
            0)
        : 0)
      ? ((k = c[h >> 2] | 0), (k | 0) != 0)
      : 0)
        ? (c[(b + 312) >> 2] | 0) != 0
        : 0
    ) {
      v = k;
      x = c[v >> 2] | 0;
      x = c[x >> 2] | 0;
      kd[x & 63](v, e);
      v = j;
      x = v;
      x = c[x >> 2] | 0;
      v = (v + 4) | 0;
      v = c[v >> 2] | 0;
      v = kr(x | 0, v | 0, 1, 0) | 0;
      x = H;
      y = j;
      w = y;
      c[w >> 2] = v;
      y = (y + 4) | 0;
      c[y >> 2] = x;
      i = f;
      return;
    }
    c[h >> 2] = 0;
    k = (b + 324) | 0;
    l = c[k >> 2] | 0;
    c[k >> 2] = 0;
    if (
      ((l | 0) != 0
      ? ((x = (l + 4) | 0), (y = c[x >> 2] | 0), (c[x >> 2] = y + -1), (y | 0) == 0)
      : 0)
        ? (jd[c[((c[l >> 2] | 0) + 8) >> 2] & 255](l),
          (x = (l + 8) | 0),
          (y = c[x >> 2] | 0),
          (c[x >> 2] = y + -1),
          (y | 0) == 0)
        : 0
    )
      jd[c[((c[l >> 2] | 0) + 16) >> 2] & 255](l);
    n = (b + 312) | 0;
    c[n >> 2] = 0;
    o = (b + 316) | 0;
    l = c[o >> 2] | 0;
    c[o >> 2] = 0;
    if (
      ((l | 0) != 0
      ? ((x = (l + 4) | 0), (y = c[x >> 2] | 0), (c[x >> 2] = y + -1), (y | 0) == 0)
      : 0)
        ? (jd[c[((c[l >> 2] | 0) + 8) >> 2] & 255](l),
          (x = (l + 8) | 0),
          (y = c[x >> 2] | 0),
          (c[x >> 2] = y + -1),
          (y | 0) == 0)
        : 0
    )
      jd[c[((c[l >> 2] | 0) + 16) >> 2] & 255](l);
    l = Tq(12) | 0;
    a: do
      if (!l) {
        while (1) {
          l = c[6860] | 0;
          c[6860] = l + 0;
          if (!l) break;
          qd[l & 3]();
          l = Tq(12) | 0;
          if (l) break a;
        }
        y = Wb(4) | 0;
        c[y >> 2] = 27280;
        Zc(y | 0, 27328, 220);
      }
    while (0);
    c[l >> 2] = b + 4;
    c[(l + 4) >> 2] = 0;
    c[(l + 8) >> 2] = -1;
    q = Tq(16) | 0;
    b: do
      if (!q) {
        while (1) {
          p = c[6860] | 0;
          c[6860] = p + 0;
          if (!p) break;
          qd[p & 3]();
          q = Tq(16) | 0;
          if (q) break b;
        }
        y = Wb(4) | 0;
        c[y >> 2] = 27280;
        Zc(y | 0, 27328, 220);
      }
    while (0);
    c[(q + 4) >> 2] = 0;
    c[(q + 8) >> 2] = 0;
    c[q >> 2] = 9736;
    c[(q + 12) >> 2] = l;
    c[n >> 2] = l;
    p = c[o >> 2] | 0;
    c[o >> 2] = q;
    if (p) {
      x = (p + 4) | 0;
      y = c[x >> 2] | 0;
      c[x >> 2] = y + -1;
      if (
        (y | 0) == 0
          ? (jd[c[((c[p >> 2] | 0) + 8) >> 2] & 255](p),
            (x = (p + 8) | 0),
            (y = c[x >> 2] | 0),
            (c[x >> 2] = y + -1),
            (y | 0) == 0)
          : 0
      )
        jd[c[((c[p >> 2] | 0) + 16) >> 2] & 255](p);
      l = c[n >> 2] | 0;
    }
    n = (m + 64) | 0;
    o = (m + 8) | 0;
    c[o >> 2] = 9416;
    p = (m + 12) | 0;
    c[m >> 2] = 9548;
    c[n >> 2] = 9568;
    c[(m + 4) >> 2] = 0;
    c[(m + 88) >> 2] = p;
    c[(m + 80) >> 2] = 0;
    c[(m + 84) >> 2] = 0;
    c[(m + 68) >> 2] = 4098;
    c[(m + 76) >> 2] = 0;
    c[(m + 72) >> 2] = 6;
    t = (m + 92) | 0;
    q = (m + 96) | 0;
    s = (q + 40) | 0;
    do {
      c[q >> 2] = 0;
      q = (q + 4) | 0;
    } while ((q | 0) < (s | 0));
    Qn(t);
    c[(m + 136) >> 2] = 0;
    c[(m + 140) >> 2] = -1;
    c[m >> 2] = 9396;
    c[n >> 2] = 9436;
    c[o >> 2] = 9416;
    c[p >> 2] = 16248;
    Qn((m + 16) | 0);
    t = (m + 20) | 0;
    c[(t + 0) >> 2] = 0;
    c[(t + 4) >> 2] = 0;
    c[(t + 8) >> 2] = 0;
    c[(t + 12) >> 2] = 0;
    c[(t + 16) >> 2] = 0;
    c[(t + 20) >> 2] = 0;
    c[p >> 2] = 9584;
    q = (m + 44) | 0;
    u = (m + 60) | 0;
    c[(q + 0) >> 2] = 0;
    c[(q + 4) >> 2] = 0;
    c[(q + 8) >> 2] = 0;
    c[(q + 12) >> 2] = 0;
    c[u >> 2] = 24;
    c[(r + 0) >> 2] = 0;
    c[(r + 4) >> 2] = 0;
    c[(r + 8) >> 2] = 0;
    Ji(q, (r + 1) | 0, 0);
    s = (m + 56) | 0;
    c[s >> 2] = 0;
    v = c[u >> 2] | 0;
    if (v & 8) {
      w = a[q >> 0] | 0;
      if (!(w & 1)) {
        w = (q + ((w & 255) >>> 1) + 1) | 0;
        c[s >> 2] = w;
        x = (q + 1) | 0;
      } else {
        x = c[(m + 52) >> 2] | 0;
        w = (x + (c[(m + 48) >> 2] | 0)) | 0;
        c[s >> 2] = w;
      }
      c[t >> 2] = x;
      c[(m + 24) >> 2] = x;
      c[(m + 28) >> 2] = w;
    }
    if (v & 16) {
      v = a[q >> 0] | 0;
      if (!(v & 1)) {
        v = (v & 255) >>> 1;
        c[s >> 2] = q + v + 1;
        w = 10;
      } else {
        v = c[(m + 48) >> 2] | 0;
        c[s >> 2] = (c[(m + 52) >> 2] | 0) + v;
        w = ((c[q >> 2] & -2) + -1) | 0;
      }
      Ki(q, w);
      x = a[q >> 0] | 0;
      if (!(x & 1)) {
        w = (q + 1) | 0;
        x = (x & 255) >>> 1;
      } else {
        w = c[(m + 52) >> 2] | 0;
        x = c[(m + 48) >> 2] | 0;
      }
      y = (m + 36) | 0;
      c[y >> 2] = w;
      c[(m + 32) >> 2] = w;
      c[(m + 40) >> 2] = w + x;
      if (c[u >> 2] & 3) c[y >> 2] = w + v;
    }
    if (a[r >> 0] & 1) Uq(c[(r + 8) >> 2] | 0);
    w = c[(b + 300) >> 2] | 0;
    r = c[(b + 304) >> 2] | 0;
    if ((w | 0) != (r | 0)) {
      v = (m + 8) | 0;
      do {
        x = c[w >> 2] | 0;
        y = c[(w + 4) >> 2] | 0;
        z = c[(w + 8) >> 2] | 0;
        Rj(Rg(Rj(Rg(Rj(Rg(v, 9360, 1) | 0, z) | 0, 9368, 1) | 0, x) | 0, 9376, 1) | 0, y) | 0;
        w = (w + 12) | 0;
      } while ((w | 0) != (r | 0));
    }
    r = c[u >> 2] | 0;
    do
      if (!(r & 16)) {
        if (!(r & 8)) {
          c[(g + 0) >> 2] = 0;
          c[(g + 4) >> 2] = 0;
          c[(g + 8) >> 2] = 0;
          break;
        }
        t = c[t >> 2] | 0;
        s = c[(m + 28) >> 2] | 0;
        r = t;
        v = (s - r) | 0;
        if (v >>> 0 > 4294967279) Ei();
        if (v >>> 0 < 11) {
          a[g >> 0] = v << 1;
          x = (g + 1) | 0;
        } else {
          u = (v + 16) & -16;
          w = (u | 0) == 0 ? 1 : u;
          x = Tq(w) | 0;
          c: do
            if (!x) {
              while (1) {
                x = c[6860] | 0;
                c[6860] = x + 0;
                if (!x) break;
                qd[x & 3]();
                x = Tq(w) | 0;
                if (x) break c;
              }
              z = Wb(4) | 0;
              c[z >> 2] = 27280;
              Zc(z | 0, 27328, 220);
            }
          while (0);
          c[(g + 8) >> 2] = x;
          c[g >> 2] = u | 1;
          c[(g + 4) >> 2] = v;
        }
        if ((t | 0) != (s | 0)) {
          u = x;
          while (1) {
            a[u >> 0] = a[t >> 0] | 0;
            t = (t + 1) | 0;
            if ((t | 0) == (s | 0)) break;
            else u = (u + 1) | 0;
          }
          x = (x + (s + (0 - r))) | 0;
        }
        a[x >> 0] = 0;
      } else {
        t = c[s >> 2] | 0;
        r = c[(m + 36) >> 2] | 0;
        if (t >>> 0 < r >>> 0) c[s >> 2] = r;
        else r = t;
        t = c[(m + 32) >> 2] | 0;
        s = t;
        v = (r - s) | 0;
        if (v >>> 0 > 4294967279) Ei();
        if (v >>> 0 < 11) {
          a[g >> 0] = v << 1;
          x = (g + 1) | 0;
        } else {
          u = (v + 16) & -16;
          w = (u | 0) == 0 ? 1 : u;
          x = Tq(w) | 0;
          d: do
            if (!x) {
              while (1) {
                x = c[6860] | 0;
                c[6860] = x + 0;
                if (!x) break;
                qd[x & 3]();
                x = Tq(w) | 0;
                if (x) break d;
              }
              z = Wb(4) | 0;
              c[z >> 2] = 27280;
              Zc(z | 0, 27328, 220);
            }
          while (0);
          c[(g + 8) >> 2] = x;
          c[g >> 2] = u | 1;
          c[(g + 4) >> 2] = v;
        }
        if ((t | 0) != (r | 0)) {
          u = x;
          while (1) {
            a[u >> 0] = a[t >> 0] | 0;
            t = (t + 1) | 0;
            if ((t | 0) == (r | 0)) break;
            else u = (u + 1) | 0;
          }
          x = (x + (r + (0 - s))) | 0;
        }
        a[x >> 0] = 0;
      }
    while (0);
    c[m >> 2] = 9396;
    c[(m + 64) >> 2] = 9436;
    c[o >> 2] = 9416;
    c[p >> 2] = 9584;
    if (a[q >> 0] & 1) Uq(c[(m + 52) >> 2] | 0);
    c[p >> 2] = 16248;
    m = c[(m + 16) >> 2] | 0;
    y = (m + 4) | 0;
    z = c[y >> 2] | 0;
    c[y >> 2] = z + -1;
    if (!z) jd[c[((c[m >> 2] | 0) + 8) >> 2] & 255](m);
    _i(n);
    do
      if (!(Qi(g, 5184) | 0)) {
        n = Tq(4788) | 0;
        e: do
          if (!n) {
            while (1) {
              m = c[6860] | 0;
              c[6860] = m + 0;
              if (!m) break;
              qd[m & 3]();
              n = Tq(4788) | 0;
              if (n) break e;
            }
            z = Wb(4) | 0;
            c[z >> 2] = 27280;
            Zc(z | 0, 27328, 220);
          }
        while (0);
        Pf(n);
        a[(n + 4784) >> 0] = 1;
        m = Tq(12) | 0;
        f: do
          if (!m) {
            while (1) {
              m = c[6860] | 0;
              c[6860] = m + 0;
              if (!m) break;
              qd[m & 3]();
              m = Tq(12) | 0;
              if (m) break f;
            }
            z = Wb(4) | 0;
            c[z >> 2] = 27280;
            Zc(z | 0, 27328, 220);
          }
        while (0);
        c[m >> 2] = 8504;
        c[(m + 4) >> 2] = l;
        c[(m + 8) >> 2] = n;
        l = Tq(16) | 0;
        g: do
          if (!l) {
            while (1) {
              l = c[6860] | 0;
              c[6860] = l + 0;
              if (!l) break;
              qd[l & 3]();
              l = Tq(16) | 0;
              if (l) break g;
            }
            z = Wb(4) | 0;
            c[z >> 2] = 27280;
            Zc(z | 0, 27328, 220);
          }
        while (0);
        c[(l + 4) >> 2] = 0;
        c[(l + 8) >> 2] = 0;
        c[l >> 2] = 8768;
        c[(l + 12) >> 2] = m;
      } else {
        if (!(Qi(g, 5192) | 0)) {
          n = Tq(5116) | 0;
          h: do
            if (!n) {
              while (1) {
                m = c[6860] | 0;
                c[6860] = m + 0;
                if (!m) break;
                qd[m & 3]();
                n = Tq(5116) | 0;
                if (n) break h;
              }
              z = Wb(4) | 0;
              c[z >> 2] = 27280;
              Zc(z | 0, 27328, 220);
            }
          while (0);
          Pf(n);
          Of((n + 4784) | 0);
          c[(n + 4952) >> 2] = 32;
          c[(n + 4956) >> 2] = 9;
          c[(n + 4960) >> 2] = 8;
          c[(n + 4964) >> 2] = 0;
          c[(n + 4984) >> 2] = 0;
          c[(n + 4988) >> 2] = 0;
          c[(n + 4992) >> 2] = 0;
          c[(n + 5008) >> 2] = 1;
          c[(n + 5012) >> 2] = 2;
          c[(n + 5004) >> 2] = 4096;
          c[(n + 5e3) >> 2] = 4;
          c[(n + 4996) >> 2] = 4;
          c[(n + 5016) >> 2] = 0;
          c[(n + 5020) >> 2] = 0;
          c[(n + 5024) >> 2] = 0;
          c[(n + 4968) >> 2] = 32;
          c[(n + 4972) >> 2] = 0;
          c[(n + 4976) >> 2] = -2147483648;
          c[(n + 4980) >> 2] = 2147483647;
          c[(n + 4948) >> 2] = 0;
          c[(n + 5032) >> 2] = 32;
          c[(n + 5036) >> 2] = 9;
          c[(n + 5040) >> 2] = 8;
          c[(n + 5044) >> 2] = 0;
          c[(n + 5064) >> 2] = 0;
          c[(n + 5068) >> 2] = 0;
          c[(n + 5072) >> 2] = 0;
          c[(n + 5088) >> 2] = 1;
          c[(n + 5092) >> 2] = 2;
          c[(n + 5084) >> 2] = 4096;
          c[(n + 5080) >> 2] = 4;
          c[(n + 5076) >> 2] = 4;
          c[(n + 5096) >> 2] = 0;
          c[(n + 5100) >> 2] = 0;
          c[(n + 5104) >> 2] = 0;
          c[(n + 5048) >> 2] = 32;
          c[(n + 5052) >> 2] = 0;
          c[(n + 5056) >> 2] = -2147483648;
          c[(n + 5060) >> 2] = 2147483647;
          c[(n + 5028) >> 2] = 0;
          a[(n + 5108) >> 0] = 0;
          a[(n + 5109) >> 0] = 0;
          a[(n + 5112) >> 0] = 1;
          m = Tq(12) | 0;
          i: do
            if (!m) {
              while (1) {
                m = c[6860] | 0;
                c[6860] = m + 0;
                if (!m) break;
                qd[m & 3]();
                m = Tq(12) | 0;
                if (m) break i;
              }
              z = Wb(4) | 0;
              c[z >> 2] = 27280;
              Zc(z | 0, 27328, 220);
            }
          while (0);
          c[m >> 2] = 7560;
          c[(m + 4) >> 2] = l;
          c[(m + 8) >> 2] = n;
          l = Tq(16) | 0;
          j: do
            if (!l) {
              while (1) {
                l = c[6860] | 0;
                c[6860] = l + 0;
                if (!l) break;
                qd[l & 3]();
                l = Tq(16) | 0;
                if (l) break j;
              }
              z = Wb(4) | 0;
              c[z >> 2] = 27280;
              Zc(z | 0, 27328, 220);
            }
          while (0);
          c[(l + 4) >> 2] = 0;
          c[(l + 8) >> 2] = 0;
          c[l >> 2] = 7848;
          c[(l + 12) >> 2] = m;
          break;
        }
        if (!(Qi(g, 5208) | 0)) {
          n = Tq(5104) | 0;
          k: do
            if (!n) {
              while (1) {
                m = c[6860] | 0;
                c[6860] = m + 0;
                if (!m) break;
                qd[m & 3]();
                n = Tq(5104) | 0;
                if (n) break k;
              }
              z = Wb(4) | 0;
              c[z >> 2] = 27280;
              Zc(z | 0, 27328, 220);
            }
          while (0);
          Pf(n);
          Nf((n + 4784) | 0);
          a[(n + 5100) >> 0] = 1;
          m = Tq(12) | 0;
          l: do
            if (!m) {
              while (1) {
                m = c[6860] | 0;
                c[6860] = m + 0;
                if (!m) break;
                qd[m & 3]();
                m = Tq(12) | 0;
                if (m) break l;
              }
              z = Wb(4) | 0;
              c[z >> 2] = 27280;
              Zc(z | 0, 27328, 220);
            }
          while (0);
          c[m >> 2] = 6616;
          c[(m + 4) >> 2] = l;
          c[(m + 8) >> 2] = n;
          l = Tq(16) | 0;
          m: do
            if (!l) {
              while (1) {
                l = c[6860] | 0;
                c[6860] = l + 0;
                if (!l) break;
                qd[l & 3]();
                l = Tq(16) | 0;
                if (l) break m;
              }
              z = Wb(4) | 0;
              c[z >> 2] = 27280;
              Zc(z | 0, 27328, 220);
            }
          while (0);
          c[(l + 4) >> 2] = 0;
          c[(l + 8) >> 2] = 0;
          c[l >> 2] = 6904;
          c[(l + 12) >> 2] = m;
          break;
        }
        if (Qi(g, 5224) | 0) {
          g = Wb(8) | 0;
          c[g >> 2] = 27520;
          f = (g + 4) | 0;
          e = Tq(45) | 0;
          n: do
            if (!e) {
              while (1) {
                e = c[6860] | 0;
                c[6860] = e + 0;
                if (!e) break;
                qd[e & 3]();
                e = Tq(45) | 0;
                if (e) break n;
              }
              z = Wb(4) | 0;
              c[z >> 2] = 27280;
              Zc(z | 0, 27328, 220);
            }
          while (0);
          c[e >> 2] = 32;
          c[(e + 4) >> 2] = 32;
          c[(e + 8) >> 2] = 0;
          b = (e + 12) | 0;
          q = (b + 0) | 0;
          e = 5296 | 0;
          s = (q + 33) | 0;
          do {
            a[q >> 0] = a[e >> 0] | 0;
            q = (q + 1) | 0;
            e = (e + 1) | 0;
          } while ((q | 0) < (s | 0));
          c[f >> 2] = b;
          c[g >> 2] = 5344;
          Zc(g | 0, 5280, 51);
        }
        n = Tq(5432) | 0;
        o: do
          if (!n) {
            while (1) {
              m = c[6860] | 0;
              c[6860] = m + 0;
              if (!m) break;
              qd[m & 3]();
              n = Tq(5432) | 0;
              if (n) break o;
            }
            z = Wb(4) | 0;
            c[z >> 2] = 27280;
            Zc(z | 0, 27328, 220);
          }
        while (0);
        Pf(n);
        Of((n + 4784) | 0);
        c[(n + 4952) >> 2] = 32;
        c[(n + 4956) >> 2] = 9;
        c[(n + 4960) >> 2] = 8;
        c[(n + 4964) >> 2] = 0;
        c[(n + 4984) >> 2] = 0;
        c[(n + 4988) >> 2] = 0;
        c[(n + 4992) >> 2] = 0;
        c[(n + 5008) >> 2] = 1;
        c[(n + 5012) >> 2] = 2;
        c[(n + 5004) >> 2] = 4096;
        c[(n + 5e3) >> 2] = 4;
        c[(n + 4996) >> 2] = 4;
        c[(n + 5016) >> 2] = 0;
        c[(n + 5020) >> 2] = 0;
        c[(n + 5024) >> 2] = 0;
        c[(n + 4968) >> 2] = 32;
        c[(n + 4972) >> 2] = 0;
        c[(n + 4976) >> 2] = -2147483648;
        c[(n + 4980) >> 2] = 2147483647;
        c[(n + 4948) >> 2] = 0;
        c[(n + 5032) >> 2] = 32;
        c[(n + 5036) >> 2] = 9;
        c[(n + 5040) >> 2] = 8;
        c[(n + 5044) >> 2] = 0;
        c[(n + 5064) >> 2] = 0;
        c[(n + 5068) >> 2] = 0;
        c[(n + 5072) >> 2] = 0;
        c[(n + 5088) >> 2] = 1;
        c[(n + 5092) >> 2] = 2;
        c[(n + 5084) >> 2] = 4096;
        c[(n + 5080) >> 2] = 4;
        c[(n + 5076) >> 2] = 4;
        c[(n + 5096) >> 2] = 0;
        c[(n + 5100) >> 2] = 0;
        c[(n + 5104) >> 2] = 0;
        c[(n + 5048) >> 2] = 32;
        c[(n + 5052) >> 2] = 0;
        c[(n + 5056) >> 2] = -2147483648;
        c[(n + 5060) >> 2] = 2147483647;
        c[(n + 5028) >> 2] = 0;
        a[(n + 5108) >> 0] = 0;
        a[(n + 5109) >> 0] = 0;
        Nf((n + 5112) | 0);
        a[(n + 5428) >> 0] = 1;
        m = Tq(12) | 0;
        p: do
          if (!m) {
            while (1) {
              m = c[6860] | 0;
              c[6860] = m + 0;
              if (!m) break;
              qd[m & 3]();
              m = Tq(12) | 0;
              if (m) break p;
            }
            z = Wb(4) | 0;
            c[z >> 2] = 27280;
            Zc(z | 0, 27328, 220);
          }
        while (0);
        c[m >> 2] = 5368;
        c[(m + 4) >> 2] = l;
        c[(m + 8) >> 2] = n;
        l = Tq(16) | 0;
        q: do
          if (!l) {
            while (1) {
              l = c[6860] | 0;
              c[6860] = l + 0;
              if (!l) break;
              qd[l & 3]();
              l = Tq(16) | 0;
              if (l) break q;
            }
            z = Wb(4) | 0;
            c[z >> 2] = 27280;
            Zc(z | 0, 27328, 220);
          }
        while (0);
        c[(l + 4) >> 2] = 0;
        c[(l + 8) >> 2] = 0;
        c[l >> 2] = 5904;
        c[(l + 12) >> 2] = m;
      }
    while (0);
    if (a[g >> 0] & 1) Uq(c[(g + 8) >> 2] | 0);
    c[h >> 2] = m;
    g = c[k >> 2] | 0;
    c[k >> 2] = l;
    if (
      ((g | 0) != 0
      ? ((y = (g + 4) | 0), (z = c[y >> 2] | 0), (c[y >> 2] = z + -1), (z | 0) == 0)
      : 0)
        ? (jd[c[((c[g >> 2] | 0) + 8) >> 2] & 255](g),
          (y = (g + 8) | 0),
          (z = c[y >> 2] | 0),
          (c[y >> 2] = z + -1),
          (z | 0) == 0)
        : 0
    )
      jd[c[((c[g >> 2] | 0) + 16) >> 2] & 255](g);
    w = (b + 328) | 0;
    y = w;
    y = kr(c[y >> 2] | 0, c[(y + 4) >> 2] | 0, 1, 0) | 0;
    c[w >> 2] = y;
    c[(w + 4) >> 2] = H;
    w = j;
    c[w >> 2] = 0;
    c[(w + 4) >> 2] = 0;
    w = c[h >> 2] | 0;
    y = c[w >> 2] | 0;
    y = c[y >> 2] | 0;
    kd[y & 63](w, e);
    w = j;
    y = w;
    y = c[y >> 2] | 0;
    w = (w + 4) | 0;
    w = c[w >> 2] | 0;
    w = kr(y | 0, w | 0, 1, 0) | 0;
    y = H;
    z = j;
    x = z;
    c[x >> 2] = w;
    z = (z + 4) | 0;
    c[z >> 2] = y;
    i = f;
    return;
  }
  function Id(a) {
    a = a | 0;
    a = ((c[(a + 8) >> 2] | 0) + 127) | 0;
    return (
      d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24) | 0
    );
  }
  function Jd(b, d, e) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    var f = 0,
      g = 0,
      h = 0,
      j = 0;
    f = i;
    g = Tq(12) | 0;
    a: do
      if (!g) {
        while (1) {
          g = c[6860] | 0;
          c[6860] = g + 0;
          if (!g) break;
          qd[g & 3]();
          g = Tq(12) | 0;
          if (g) break a;
        }
        h = Wb(4) | 0;
        c[h >> 2] = 27280;
        Zc(h | 0, 27328, 220);
      }
    while (0);
    c[g >> 2] = d;
    c[(g + 4) >> 2] = e;
    c[(g + 8) >> 2] = 0;
    d = Tq(16) | 0;
    b: do
      if (!d) {
        while (1) {
          e = c[6860] | 0;
          c[6860] = e + 0;
          if (!e) break;
          qd[e & 3]();
          d = Tq(16) | 0;
          if (d) break b;
        }
        h = Wb(4) | 0;
        c[h >> 2] = 27280;
        Zc(h | 0, 27328, 220);
      }
    while (0);
    c[(d + 4) >> 2] = 0;
    c[(d + 8) >> 2] = 0;
    c[d >> 2] = 5008;
    c[(d + 12) >> 2] = g;
    c[b >> 2] = g;
    h = (b + 4) | 0;
    e = c[h >> 2] | 0;
    c[h >> 2] = d;
    if (!e) e = g;
    else {
      d = (e + 4) | 0;
      h = c[d >> 2] | 0;
      c[d >> 2] = h + -1;
      if (
        (h | 0) == 0
          ? (jd[c[((c[e >> 2] | 0) + 8) >> 2] & 255](e),
            (d = (e + 8) | 0),
            (h = c[d >> 2] | 0),
            (c[d >> 2] = h + -1),
            (h | 0) == 0)
          : 0
      )
        jd[c[((c[e >> 2] | 0) + 16) >> 2] & 255](e);
      e = c[b >> 2] | 0;
    }
    g = Tq(12) | 0;
    c: do
      if (!g) {
        while (1) {
          g = c[6860] | 0;
          c[6860] = g + 0;
          if (!g) break;
          qd[g & 3]();
          g = Tq(12) | 0;
          if (g) break c;
        }
        h = Wb(4) | 0;
        c[h >> 2] = 27280;
        Zc(h | 0, 27328, 220);
      }
    while (0);
    c[g >> 2] = e;
    c[(g + 4) >> 2] = 0;
    c[(g + 8) >> 2] = -1;
    h = Tq(16) | 0;
    d: do
      if (!h) {
        while (1) {
          e = c[6860] | 0;
          c[6860] = e + 0;
          if (!e) break;
          qd[e & 3]();
          h = Tq(16) | 0;
          if (h) break d;
        }
        h = Wb(4) | 0;
        c[h >> 2] = 27280;
        Zc(h | 0, 27328, 220);
      }
    while (0);
    c[(h + 4) >> 2] = 0;
    c[(h + 8) >> 2] = 0;
    c[h >> 2] = 4760;
    c[(h + 12) >> 2] = g;
    e = (b + 8) | 0;
    c[e >> 2] = g;
    j = (b + 12) | 0;
    d = c[j >> 2] | 0;
    c[j >> 2] = h;
    if (d) {
      h = (d + 4) | 0;
      j = c[h >> 2] | 0;
      c[h >> 2] = j + -1;
      if (
        (j | 0) == 0
          ? (jd[c[((c[d >> 2] | 0) + 8) >> 2] & 255](d),
            (h = (d + 8) | 0),
            (j = c[h >> 2] | 0),
            (c[h >> 2] = j + -1),
            (j | 0) == 0)
          : 0
      )
        jd[c[((c[d >> 2] | 0) + 16) >> 2] & 255](d);
      g = c[e >> 2] | 0;
    }
    e = Tq(24) | 0;
    e: do
      if (!e) {
        while (1) {
          e = c[6860] | 0;
          c[6860] = e + 0;
          if (!e) break;
          qd[e & 3]();
          e = Tq(24) | 0;
          if (e) break e;
        }
        j = Wb(4) | 0;
        c[j >> 2] = 27280;
        Zc(j | 0, 27328, 220);
      }
    while (0);
    c[e >> 2] = 4248;
    c[(e + 4) >> 2] = g;
    c[(e + 8) >> 2] = 0;
    c[(e + 12) >> 2] = 0;
    c[(e + 16) >> 2] = 0;
    a[(e + 20) >> 0] = 1;
    g = Tq(16) | 0;
    f: do
      if (!g) {
        while (1) {
          g = c[6860] | 0;
          c[6860] = g + 0;
          if (!g) break;
          qd[g & 3]();
          g = Tq(16) | 0;
          if (g) break f;
        }
        j = Wb(4) | 0;
        c[j >> 2] = 27280;
        Zc(j | 0, 27328, 220);
      }
    while (0);
    c[(g + 4) >> 2] = 0;
    c[(g + 8) >> 2] = 0;
    c[g >> 2] = 4424;
    c[(g + 12) >> 2] = e;
    c[(b + 16) >> 2] = e;
    j = (b + 20) | 0;
    b = c[j >> 2] | 0;
    c[j >> 2] = g;
    if (!b) {
      i = f;
      return;
    }
    h = (b + 4) | 0;
    j = c[h >> 2] | 0;
    c[h >> 2] = j + -1;
    if (j) {
      i = f;
      return;
    }
    jd[c[((c[b >> 2] | 0) + 8) >> 2] & 255](b);
    h = (b + 8) | 0;
    j = c[h >> 2] | 0;
    c[h >> 2] = j + -1;
    if (j) {
      i = f;
      return;
    }
    jd[c[((c[b >> 2] | 0) + 16) >> 2] & 255](b);
    i = f;
    return;
  }
  function Kd(a, b) {
    a = a | 0;
    b = b | 0;
    var d = 0,
      e = 0;
    d = i;
    e = (a + 16) | 0;
    a = c[e >> 2] | 0;
    if (!a) {
      i = d;
      return;
    }
    if ((b | 0) == 4) {
      Oe(a);
      i = d;
      return;
    } else if ((b | 0) == 8) {
      ae(a);
      ae(c[e >> 2] | 0);
      i = d;
      return;
    } else {
      i = d;
      return;
    }
  }
  function Ld(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0;
    e = i;
    i = (i + 16) | 0;
    f = (e + 8) | 0;
    g = e;
    h = (b + 16) | 0;
    b = c[h >> 2] | 0;
    if (!b) {
      i = e;
      return;
    }
    if ((d | 0) == 1) {
      d = Tq(172) | 0;
      a: do
        if (!d) {
          while (1) {
            f = c[6860] | 0;
            c[6860] = f + 0;
            if (!f) break;
            qd[f & 3]();
            d = Tq(172) | 0;
            if (d) break a;
          }
          l = Wb(4) | 0;
          c[l >> 2] = 27280;
          Zc(l | 0, 27328, 220);
        }
      while (0);
      f = c[(b + 4) >> 2] | 0;
      c[d >> 2] = 3640;
      c[(d + 4) >> 2] = f;
      c[(d + 12) >> 2] = 8;
      c[(d + 16) >> 2] = 1;
      c[(d + 20) >> 2] = 8;
      c[(d + 24) >> 2] = 0;
      c[(d + 44) >> 2] = 0;
      c[(d + 48) >> 2] = 0;
      c[(d + 52) >> 2] = 0;
      c[(d + 68) >> 2] = 1;
      c[(d + 72) >> 2] = 2;
      c[(d + 64) >> 2] = 4096;
      c[(d + 60) >> 2] = 4;
      c[(d + 56) >> 2] = 4;
      c[(d + 76) >> 2] = 0;
      c[(d + 80) >> 2] = 0;
      c[(d + 84) >> 2] = 0;
      c[(d + 28) >> 2] = 8;
      c[(d + 32) >> 2] = 256;
      c[(d + 36) >> 2] = -128;
      c[(d + 40) >> 2] = 127;
      c[(d + 8) >> 2] = 0;
      c[(d + 92) >> 2] = 8;
      c[(d + 96) >> 2] = 1;
      c[(d + 100) >> 2] = 8;
      c[(d + 104) >> 2] = 0;
      c[(d + 124) >> 2] = 0;
      c[(d + 128) >> 2] = 0;
      c[(d + 132) >> 2] = 0;
      c[(d + 148) >> 2] = 1;
      c[(d + 152) >> 2] = 2;
      c[(d + 144) >> 2] = 4096;
      c[(d + 140) >> 2] = 4;
      c[(d + 136) >> 2] = 4;
      c[(d + 156) >> 2] = 0;
      c[(d + 160) >> 2] = 0;
      c[(d + 164) >> 2] = 0;
      c[(d + 108) >> 2] = 8;
      c[(d + 112) >> 2] = 256;
      c[(d + 116) >> 2] = -128;
      c[(d + 120) >> 2] = 127;
      c[(d + 88) >> 2] = 0;
      a[(d + 168) >> 0] = 0;
      a[(d + 169) >> 0] = 0;
      a[(d + 171) >> 0] = 0;
      f = (b + 8) | 0;
      c[g >> 2] = d;
      k = Tq(16) | 0;
      b: do
        if (!k) {
          while (1) {
            h = c[6860] | 0;
            c[6860] = h + 0;
            if (!h) break;
            qd[h & 3]();
            k = Tq(16) | 0;
            if (k) break b;
          }
          l = Wb(4) | 0;
          c[l >> 2] = 27280;
          Zc(l | 0, 27328, 220);
        }
      while (0);
      c[(k + 4) >> 2] = 0;
      c[(k + 8) >> 2] = 0;
      c[k >> 2] = 3824;
      c[(k + 12) >> 2] = d;
      j = (g + 4) | 0;
      c[j >> 2] = k;
      h = (b + 12) | 0;
      l = c[h >> 2] | 0;
      if (l >>> 0 < (c[(b + 16) >> 2] | 0) >>> 0) {
        if (!l) b = 0;
        else {
          c[l >> 2] = d;
          c[(l + 4) >> 2] = k;
          c[g >> 2] = 0;
          c[j >> 2] = 0;
          k = 0;
          b = c[h >> 2] | 0;
        }
        c[h >> 2] = b + 8;
      } else {
        ve(f, g);
        k = c[j >> 2] | 0;
      }
      if (!k) {
        i = e;
        return;
      }
      j = (k + 4) | 0;
      l = c[j >> 2] | 0;
      c[j >> 2] = l + -1;
      if (l) {
        i = e;
        return;
      }
      jd[c[((c[k >> 2] | 0) + 8) >> 2] & 255](k);
      j = (k + 8) | 0;
      l = c[j >> 2] | 0;
      c[j >> 2] = l + -1;
      if (l) {
        i = e;
        return;
      }
      jd[c[((c[k >> 2] | 0) + 16) >> 2] & 255](k);
      i = e;
      return;
    } else if ((d | 0) == 8) {
      Oe(b);
      b = c[h >> 2] | 0;
    } else if ((d | 0) != 4)
      if ((d | 0) == 2) {
        g = Tq(176) | 0;
        c: do
          if (!g) {
            while (1) {
              g = c[6860] | 0;
              c[6860] = g + 0;
              if (!g) break;
              qd[g & 3]();
              g = Tq(176) | 0;
              if (g) break c;
            }
            l = Wb(4) | 0;
            c[l >> 2] = 27280;
            Zc(l | 0, 27328, 220);
          }
        while (0);
        d = c[(b + 4) >> 2] | 0;
        c[g >> 2] = 3032;
        c[(g + 4) >> 2] = d;
        c[(g + 12) >> 2] = 16;
        c[(g + 16) >> 2] = 1;
        c[(g + 20) >> 2] = 8;
        c[(g + 24) >> 2] = 0;
        c[(g + 44) >> 2] = 0;
        c[(g + 48) >> 2] = 0;
        c[(g + 52) >> 2] = 0;
        c[(g + 68) >> 2] = 1;
        c[(g + 72) >> 2] = 2;
        c[(g + 64) >> 2] = 4096;
        c[(g + 60) >> 2] = 4;
        c[(g + 56) >> 2] = 4;
        c[(g + 76) >> 2] = 0;
        c[(g + 80) >> 2] = 0;
        c[(g + 84) >> 2] = 0;
        c[(g + 28) >> 2] = 16;
        c[(g + 32) >> 2] = 65536;
        c[(g + 36) >> 2] = -32768;
        c[(g + 40) >> 2] = 32767;
        c[(g + 8) >> 2] = 0;
        c[(g + 92) >> 2] = 16;
        c[(g + 96) >> 2] = 1;
        c[(g + 100) >> 2] = 8;
        c[(g + 104) >> 2] = 0;
        c[(g + 124) >> 2] = 0;
        c[(g + 128) >> 2] = 0;
        c[(g + 132) >> 2] = 0;
        c[(g + 148) >> 2] = 1;
        c[(g + 152) >> 2] = 2;
        c[(g + 144) >> 2] = 4096;
        c[(g + 140) >> 2] = 4;
        c[(g + 136) >> 2] = 4;
        c[(g + 156) >> 2] = 0;
        c[(g + 160) >> 2] = 0;
        c[(g + 164) >> 2] = 0;
        c[(g + 108) >> 2] = 16;
        c[(g + 112) >> 2] = 65536;
        c[(g + 116) >> 2] = -32768;
        c[(g + 120) >> 2] = 32767;
        c[(g + 88) >> 2] = 0;
        a[(g + 168) >> 0] = 0;
        a[(g + 169) >> 0] = 0;
        a[(g + 172) >> 0] = 0;
        d = (b + 8) | 0;
        c[f >> 2] = g;
        j = Tq(16) | 0;
        d: do
          if (!j) {
            while (1) {
              h = c[6860] | 0;
              c[6860] = h + 0;
              if (!h) break;
              qd[h & 3]();
              j = Tq(16) | 0;
              if (j) break d;
            }
            l = Wb(4) | 0;
            c[l >> 2] = 27280;
            Zc(l | 0, 27328, 220);
          }
        while (0);
        c[(j + 4) >> 2] = 0;
        c[(j + 8) >> 2] = 0;
        c[j >> 2] = 3216;
        c[(j + 12) >> 2] = g;
        l = (f + 4) | 0;
        c[l >> 2] = j;
        h = (b + 12) | 0;
        k = c[h >> 2] | 0;
        if (k >>> 0 < (c[(b + 16) >> 2] | 0) >>> 0) {
          if (!k) b = 0;
          else {
            c[k >> 2] = g;
            c[(k + 4) >> 2] = j;
            c[f >> 2] = 0;
            c[l >> 2] = 0;
            b = c[h >> 2] | 0;
            j = 0;
          }
          c[h >> 2] = b + 8;
        } else {
          ve(d, f);
          j = c[l >> 2] | 0;
        }
        if (!j) {
          i = e;
          return;
        }
        k = (j + 4) | 0;
        l = c[k >> 2] | 0;
        c[k >> 2] = l + -1;
        if (l) {
          i = e;
          return;
        }
        jd[c[((c[j >> 2] | 0) + 8) >> 2] & 255](j);
        k = (j + 8) | 0;
        l = c[k >> 2] | 0;
        c[k >> 2] = l + -1;
        if (l) {
          i = e;
          return;
        }
        jd[c[((c[j >> 2] | 0) + 16) >> 2] & 255](j);
        i = e;
        return;
      } else {
        i = e;
        return;
      }
    Oe(b);
    i = e;
    return;
  }
  function Md(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0;
    e = i;
    i = (i + 16) | 0;
    f = (e + 8) | 0;
    g = e;
    h = (b + 16) | 0;
    b = c[h >> 2] | 0;
    if (!b) {
      i = e;
      return;
    }
    if ((d | 0) == 2) {
      d = Tq(176) | 0;
      a: do
        if (!d) {
          while (1) {
            g = c[6860] | 0;
            c[6860] = g + 0;
            if (!g) break;
            qd[g & 3]();
            d = Tq(176) | 0;
            if (d) break a;
          }
          l = Wb(4) | 0;
          c[l >> 2] = 27280;
          Zc(l | 0, 27328, 220);
        }
      while (0);
      g = c[(b + 4) >> 2] | 0;
      c[d >> 2] = 1208;
      c[(d + 4) >> 2] = g;
      c[(d + 12) >> 2] = 16;
      c[(d + 16) >> 2] = 1;
      c[(d + 20) >> 2] = 8;
      c[(d + 24) >> 2] = 0;
      c[(d + 44) >> 2] = 0;
      c[(d + 48) >> 2] = 0;
      c[(d + 52) >> 2] = 0;
      c[(d + 68) >> 2] = 1;
      c[(d + 72) >> 2] = 2;
      c[(d + 64) >> 2] = 4096;
      c[(d + 60) >> 2] = 4;
      c[(d + 56) >> 2] = 4;
      c[(d + 76) >> 2] = 0;
      c[(d + 80) >> 2] = 0;
      c[(d + 84) >> 2] = 0;
      c[(d + 28) >> 2] = 16;
      c[(d + 32) >> 2] = 65536;
      c[(d + 36) >> 2] = -32768;
      c[(d + 40) >> 2] = 32767;
      c[(d + 8) >> 2] = 0;
      c[(d + 92) >> 2] = 16;
      c[(d + 96) >> 2] = 1;
      c[(d + 100) >> 2] = 8;
      c[(d + 104) >> 2] = 0;
      c[(d + 124) >> 2] = 0;
      c[(d + 128) >> 2] = 0;
      c[(d + 132) >> 2] = 0;
      c[(d + 148) >> 2] = 1;
      c[(d + 152) >> 2] = 2;
      c[(d + 144) >> 2] = 4096;
      c[(d + 140) >> 2] = 4;
      c[(d + 136) >> 2] = 4;
      c[(d + 156) >> 2] = 0;
      c[(d + 160) >> 2] = 0;
      c[(d + 164) >> 2] = 0;
      c[(d + 108) >> 2] = 16;
      c[(d + 112) >> 2] = 65536;
      c[(d + 116) >> 2] = -32768;
      c[(d + 120) >> 2] = 32767;
      c[(d + 88) >> 2] = 0;
      a[(d + 168) >> 0] = 0;
      a[(d + 169) >> 0] = 0;
      a[(d + 172) >> 0] = 0;
      g = (b + 8) | 0;
      c[f >> 2] = d;
      j = Tq(16) | 0;
      b: do
        if (!j) {
          while (1) {
            h = c[6860] | 0;
            c[6860] = h + 0;
            if (!h) break;
            qd[h & 3]();
            j = Tq(16) | 0;
            if (j) break b;
          }
          l = Wb(4) | 0;
          c[l >> 2] = 27280;
          Zc(l | 0, 27328, 220);
        }
      while (0);
      c[(j + 4) >> 2] = 0;
      c[(j + 8) >> 2] = 0;
      c[j >> 2] = 1392;
      c[(j + 12) >> 2] = d;
      k = (f + 4) | 0;
      c[k >> 2] = j;
      h = (b + 12) | 0;
      l = c[h >> 2] | 0;
      if (l >>> 0 < (c[(b + 16) >> 2] | 0) >>> 0) {
        if (!l) b = 0;
        else {
          c[l >> 2] = d;
          c[(l + 4) >> 2] = j;
          c[f >> 2] = 0;
          c[k >> 2] = 0;
          b = c[h >> 2] | 0;
          j = 0;
        }
        c[h >> 2] = b + 8;
      } else {
        ve(g, f);
        j = c[k >> 2] | 0;
      }
      if (!j) {
        i = e;
        return;
      }
      k = (j + 4) | 0;
      l = c[k >> 2] | 0;
      c[k >> 2] = l + -1;
      if (l) {
        i = e;
        return;
      }
      jd[c[((c[j >> 2] | 0) + 8) >> 2] & 255](j);
      k = (j + 8) | 0;
      l = c[k >> 2] | 0;
      c[k >> 2] = l + -1;
      if (l) {
        i = e;
        return;
      }
      jd[c[((c[j >> 2] | 0) + 16) >> 2] & 255](j);
      i = e;
      return;
    } else if ((d | 0) == 8) {
      ae(b);
      b = c[h >> 2] | 0;
    } else if ((d | 0) != 4)
      if ((d | 0) == 1) {
        f = Tq(172) | 0;
        c: do
          if (!f) {
            while (1) {
              f = c[6860] | 0;
              c[6860] = f + 0;
              if (!f) break;
              qd[f & 3]();
              f = Tq(172) | 0;
              if (f) break c;
            }
            l = Wb(4) | 0;
            c[l >> 2] = 27280;
            Zc(l | 0, 27328, 220);
          }
        while (0);
        d = c[(b + 4) >> 2] | 0;
        c[f >> 2] = 1816;
        c[(f + 4) >> 2] = d;
        c[(f + 12) >> 2] = 8;
        c[(f + 16) >> 2] = 1;
        c[(f + 20) >> 2] = 8;
        c[(f + 24) >> 2] = 0;
        c[(f + 44) >> 2] = 0;
        c[(f + 48) >> 2] = 0;
        c[(f + 52) >> 2] = 0;
        c[(f + 68) >> 2] = 1;
        c[(f + 72) >> 2] = 2;
        c[(f + 64) >> 2] = 4096;
        c[(f + 60) >> 2] = 4;
        c[(f + 56) >> 2] = 4;
        c[(f + 76) >> 2] = 0;
        c[(f + 80) >> 2] = 0;
        c[(f + 84) >> 2] = 0;
        c[(f + 28) >> 2] = 8;
        c[(f + 32) >> 2] = 256;
        c[(f + 36) >> 2] = -128;
        c[(f + 40) >> 2] = 127;
        c[(f + 8) >> 2] = 0;
        c[(f + 92) >> 2] = 8;
        c[(f + 96) >> 2] = 1;
        c[(f + 100) >> 2] = 8;
        c[(f + 104) >> 2] = 0;
        c[(f + 124) >> 2] = 0;
        c[(f + 128) >> 2] = 0;
        c[(f + 132) >> 2] = 0;
        c[(f + 148) >> 2] = 1;
        c[(f + 152) >> 2] = 2;
        c[(f + 144) >> 2] = 4096;
        c[(f + 140) >> 2] = 4;
        c[(f + 136) >> 2] = 4;
        c[(f + 156) >> 2] = 0;
        c[(f + 160) >> 2] = 0;
        c[(f + 164) >> 2] = 0;
        c[(f + 108) >> 2] = 8;
        c[(f + 112) >> 2] = 256;
        c[(f + 116) >> 2] = -128;
        c[(f + 120) >> 2] = 127;
        c[(f + 88) >> 2] = 0;
        a[(f + 168) >> 0] = 0;
        a[(f + 169) >> 0] = 0;
        a[(f + 171) >> 0] = 0;
        d = (b + 8) | 0;
        c[g >> 2] = f;
        l = Tq(16) | 0;
        d: do
          if (!l) {
            while (1) {
              h = c[6860] | 0;
              c[6860] = h + 0;
              if (!h) break;
              qd[h & 3]();
              l = Tq(16) | 0;
              if (l) break d;
            }
            l = Wb(4) | 0;
            c[l >> 2] = 27280;
            Zc(l | 0, 27328, 220);
          }
        while (0);
        c[(l + 4) >> 2] = 0;
        c[(l + 8) >> 2] = 0;
        c[l >> 2] = 2e3;
        c[(l + 12) >> 2] = f;
        j = (g + 4) | 0;
        c[j >> 2] = l;
        h = (b + 12) | 0;
        k = c[h >> 2] | 0;
        if (k >>> 0 < (c[(b + 16) >> 2] | 0) >>> 0) {
          if (!k) b = 0;
          else {
            c[k >> 2] = f;
            c[(k + 4) >> 2] = l;
            c[g >> 2] = 0;
            c[j >> 2] = 0;
            l = 0;
            b = c[h >> 2] | 0;
          }
          c[h >> 2] = b + 8;
        } else {
          ve(d, g);
          l = c[j >> 2] | 0;
        }
        if (!l) {
          i = e;
          return;
        }
        j = (l + 4) | 0;
        k = c[j >> 2] | 0;
        c[j >> 2] = k + -1;
        if (k) {
          i = e;
          return;
        }
        jd[c[((c[l >> 2] | 0) + 8) >> 2] & 255](l);
        j = (l + 8) | 0;
        k = c[j >> 2] | 0;
        c[j >> 2] = k + -1;
        if (k) {
          i = e;
          return;
        }
        jd[c[((c[l >> 2] | 0) + 16) >> 2] & 255](l);
        i = e;
        return;
      } else {
        i = e;
        return;
      }
    ae(b);
    i = e;
    return;
  }
  function Nd(a, b) {
    a = a | 0;
    b = b | 0;
    var d = 0;
    d = i;
    a = c[(a + 16) >> 2] | 0;
    if (!a) {
      i = d;
      return;
    }
    kd[c[c[a >> 2] >> 2] & 63](a, b);
    i = d;
    return;
  }
  function Od(a, b, e) {
    a = a | 0;
    b = b | 0;
    e = e | 0;
    var f = 0,
      g = 0;
    f = i;
    g = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
    a = (a + 4) | 0;
    a = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
    b = (b + (a >> 1)) | 0;
    if (!(a & 1)) {
      a = g;
      kd[a & 63](b, e);
      i = f;
      return;
    } else {
      a = c[((c[b >> 2] | 0) + g) >> 2] | 0;
      kd[a & 63](b, e);
      i = f;
      return;
    }
  }
  function Pd(a, b, e) {
    a = a | 0;
    b = b | 0;
    e = e | 0;
    var f = 0,
      g = 0;
    f = i;
    g = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
    a = (a + 4) | 0;
    a = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
    b = (b + (a >> 1)) | 0;
    if (!(a & 1)) {
      a = g;
      kd[a & 63](b, e);
      i = f;
      return;
    } else {
      a = c[((c[b >> 2] | 0) + g) >> 2] | 0;
      kd[a & 63](b, e);
      i = f;
      return;
    }
  }
  function Qd(a, b, e, f) {
    a = a | 0;
    b = b | 0;
    e = e | 0;
    f = f | 0;
    var g = 0,
      h = 0;
    g = i;
    h = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
    a = (a + 4) | 0;
    a = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
    b = (b + (a >> 1)) | 0;
    if (!(a & 1)) {
      a = h;
      od[a & 15](b, e, f);
      i = g;
      return;
    } else {
      a = c[((c[b >> 2] | 0) + h) >> 2] | 0;
      od[a & 15](b, e, f);
      i = g;
      return;
    }
  }
  function Rd() {
    var a = 0,
      b = 0;
    a = i;
    b = Tq(24) | 0;
    a: do
      if (!b) {
        while (1) {
          b = c[6860] | 0;
          c[6860] = b + 0;
          if (!b) break;
          qd[b & 3]();
          b = Tq(24) | 0;
          if (b) break a;
        }
        b = Wb(4) | 0;
        c[b >> 2] = 27280;
        Zc(b | 0, 27328, 220);
      }
    while (0);
    c[(b + 0) >> 2] = 0;
    c[(b + 4) >> 2] = 0;
    c[(b + 8) >> 2] = 0;
    c[(b + 12) >> 2] = 0;
    c[(b + 16) >> 2] = 0;
    c[(b + 20) >> 2] = 0;
    i = a;
    return b | 0;
  }
  function Sd(a) {
    a = a | 0;
    var b = 0;
    b = i;
    a = id[a & 3]() | 0;
    i = b;
    return a | 0;
  }
  function Td(a) {
    a = a | 0;
    return 200;
  }
  function Ud(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0;
    b = i;
    if (!a) {
      i = b;
      return;
    }
    c[a >> 2] = 0;
    d = (a + 4) | 0;
    e = c[d >> 2] | 0;
    c[d >> 2] = 0;
    if (
      ((e | 0) != 0
      ? ((f = (e + 4) | 0), (g = c[f >> 2] | 0), (c[f >> 2] = g + -1), (g | 0) == 0)
      : 0)
        ? (jd[c[((c[e >> 2] | 0) + 8) >> 2] & 255](e),
          (f = (e + 8) | 0),
          (g = c[f >> 2] | 0),
          (c[f >> 2] = g + -1),
          (g | 0) == 0)
        : 0
    )
      jd[c[((c[e >> 2] | 0) + 16) >> 2] & 255](e);
    e = (a + 16) | 0;
    c[e >> 2] = 0;
    f = (a + 20) | 0;
    g = c[f >> 2] | 0;
    c[f >> 2] = 0;
    if (g) {
      j = (g + 4) | 0;
      h = c[j >> 2] | 0;
      c[j >> 2] = h + -1;
      if (
        (h | 0) == 0
          ? (jd[c[((c[g >> 2] | 0) + 8) >> 2] & 255](g),
            (h = (g + 8) | 0),
            (j = c[h >> 2] | 0),
            (c[h >> 2] = j + -1),
            (j | 0) == 0)
          : 0
      )
        jd[c[((c[g >> 2] | 0) + 16) >> 2] & 255](g);
      g = c[f >> 2] | 0;
      c[e >> 2] = 0;
      c[f >> 2] = 0;
      if (g) {
        h = (g + 4) | 0;
        j = c[h >> 2] | 0;
        c[h >> 2] = j + -1;
        if (
          (j | 0) == 0
            ? (jd[c[((c[g >> 2] | 0) + 8) >> 2] & 255](g),
              (h = (g + 8) | 0),
              (j = c[h >> 2] | 0),
              (c[h >> 2] = j + -1),
              (j | 0) == 0)
            : 0
        )
          jd[c[((c[g >> 2] | 0) + 16) >> 2] & 255](g);
        e = c[f >> 2] | 0;
        if (
          ((e | 0) != 0
          ? ((h = (e + 4) | 0), (j = c[h >> 2] | 0), (c[h >> 2] = j + -1), (j | 0) == 0)
          : 0)
            ? (jd[c[((c[e >> 2] | 0) + 8) >> 2] & 255](e),
              (h = (e + 8) | 0),
              (j = c[h >> 2] | 0),
              (c[h >> 2] = j + -1),
              (j | 0) == 0)
            : 0
        )
          jd[c[((c[e >> 2] | 0) + 16) >> 2] & 255](e);
      }
    } else {
      c[e >> 2] = 0;
      c[f >> 2] = 0;
    }
    e = c[(a + 12) >> 2] | 0;
    if (
      ((e | 0) != 0
      ? ((h = (e + 4) | 0), (j = c[h >> 2] | 0), (c[h >> 2] = j + -1), (j | 0) == 0)
      : 0)
        ? (jd[c[((c[e >> 2] | 0) + 8) >> 2] & 255](e),
          (h = (e + 8) | 0),
          (j = c[h >> 2] | 0),
          (c[h >> 2] = j + -1),
          (j | 0) == 0)
        : 0
    )
      jd[c[((c[e >> 2] | 0) + 16) >> 2] & 255](e);
    d = c[d >> 2] | 0;
    if (
      ((d | 0) != 0
      ? ((h = (d + 4) | 0), (j = c[h >> 2] | 0), (c[h >> 2] = j + -1), (j | 0) == 0)
      : 0)
        ? (jd[c[((c[d >> 2] | 0) + 8) >> 2] & 255](d),
          (h = (d + 8) | 0),
          (j = c[h >> 2] | 0),
          (c[h >> 2] = j + -1),
          (j | 0) == 0)
        : 0
    )
      jd[c[((c[d >> 2] | 0) + 16) >> 2] & 255](d);
    Uq(a);
    i = b;
    return;
  }
  function Vd(a, b) {
    a = a | 0;
    b = b | 0;
    var e = 0,
      f = 0;
    e = i;
    f = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
    a = (a + 4) | 0;
    a = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
    b = (b + (a >> 1)) | 0;
    if (!(a & 1)) {
      a = f;
      a = md[a & 127](b) | 0;
      i = e;
      return a | 0;
    } else {
      a = c[((c[b >> 2] | 0) + f) >> 2] | 0;
      a = md[a & 127](b) | 0;
      i = e;
      return a | 0;
    }
    return 0;
  }
  function Wd(a, b, e) {
    a = a | 0;
    b = b | 0;
    e = e | 0;
    var f = 0,
      g = 0;
    f = i;
    g = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
    a = (a + 4) | 0;
    a = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
    b = (b + (a >> 1)) | 0;
    if (!(a & 1)) {
      a = g;
      kd[a & 63](b, e);
      i = f;
      return;
    } else {
      a = c[((c[b >> 2] | 0) + g) >> 2] | 0;
      kd[a & 63](b, e);
      i = f;
      return;
    }
  }
  function Xd(a, b, e, f) {
    a = a | 0;
    b = b | 0;
    e = e | 0;
    f = f | 0;
    var g = 0,
      h = 0;
    g = i;
    h = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
    a = (a + 4) | 0;
    a = d[a >> 0] | (d[(a + 1) >> 0] << 8) | (d[(a + 2) >> 0] << 16) | (d[(a + 3) >> 0] << 24);
    b = (b + (a >> 1)) | 0;
    if (!(a & 1)) {
      a = h;
      od[a & 15](b, e, f);
      i = g;
      return;
    } else {
      a = c[((c[b >> 2] | 0) + h) >> 2] | 0;
      od[a & 15](b, e, f);
      i = g;
      return;
    }
  }
  function Yd() {
    var a = 0,
      b = 0;
    a = i;
    b = Tq(16) | 0;
    a: do
      if (!b) {
        while (1) {
          b = c[6860] | 0;
          c[6860] = b + 0;
          if (!b) break;
          qd[b & 3]();
          b = Tq(16) | 0;
          if (b) break a;
        }
        b = Wb(4) | 0;
        c[b >> 2] = 27280;
        Zc(b | 0, 27328, 220);
      }
    while (0);
    c[(b + 0) >> 2] = 0;
    c[(b + 4) >> 2] = 0;
    c[(b + 8) >> 2] = 0;
    c[(b + 12) >> 2] = 0;
    i = a;
    return b | 0;
  }
  function Zd(a) {
    a = a | 0;
    var b = 0;
    b = i;
    a = id[a & 3]() | 0;
    i = b;
    return a | 0;
  }
  function _d(a) {
    a = a | 0;
    return 384;
  }
  function $d(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0,
      f = 0,
      g = 0,
      h = 0;
    b = i;
    if (!a) {
      i = b;
      return;
    }
    c[a >> 2] = 0;
    d = (a + 4) | 0;
    e = c[d >> 2] | 0;
    c[d >> 2] = 0;
    if (
      ((e | 0) != 0
      ? ((g = (e + 4) | 0), (f = c[g >> 2] | 0), (c[g >> 2] = f + -1), (f | 0) == 0)
      : 0)
        ? (jd[c[((c[e >> 2] | 0) + 8) >> 2] & 255](e),
          (f = (e + 8) | 0),
          (g = c[f >> 2] | 0),
          (c[f >> 2] = g + -1),
          (g | 0) == 0)
        : 0
    )
      jd[c[((c[e >> 2] | 0) + 16) >> 2] & 255](e);
    c[(a + 8) >> 2] = 0;
    e = (a + 12) | 0;
    f = c[e >> 2] | 0;
    c[e >> 2] = 0;
    if (f) {
      h = (f + 4) | 0;
      g = c[h >> 2] | 0;
      c[h >> 2] = g + -1;
      if (
        (g | 0) == 0
          ? (jd[c[((c[f >> 2] | 0) + 8) >> 2] & 255](f),
            (g = (f + 8) | 0),
            (h = c[g >> 2] | 0),
            (c[g >> 2] = h + -1),
            (h | 0) == 0)
          : 0
      )
        jd[c[((c[f >> 2] | 0) + 16) >> 2] & 255](f);
      e = c[e >> 2] | 0;
      if (
        ((e | 0) != 0
        ? ((g = (e + 4) | 0), (h = c[g >> 2] | 0), (c[g >> 2] = h + -1), (h | 0) == 0)
        : 0)
          ? (jd[c[((c[e >> 2] | 0) + 8) >> 2] & 255](e),
            (g = (e + 8) | 0),
            (h = c[g >> 2] | 0),
            (c[g >> 2] = h + -1),
            (h | 0) == 0)
          : 0
      )
        jd[c[((c[e >> 2] | 0) + 16) >> 2] & 255](e);
    }
    d = c[d >> 2] | 0;
    if (
      ((d | 0) != 0
      ? ((g = (d + 4) | 0), (h = c[g >> 2] | 0), (c[g >> 2] = h + -1), (h | 0) == 0)
      : 0)
        ? (jd[c[((c[d >> 2] | 0) + 8) >> 2] & 255](d),
          (g = (d + 8) | 0),
          (h = c[g >> 2] | 0),
          (c[g >> 2] = h + -1),
          (h | 0) == 0)
        : 0
    )
      jd[c[((c[d >> 2] | 0) + 16) >> 2] & 255](d);
    Uq(a);
    i = b;
    return;
  }
  function ae(b) {
    b = b | 0;
    var d = 0,
      e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0;
    d = i;
    i = (i + 16) | 0;
    e = d;
    f = Tq(180) | 0;
    a: do
      if (!f) {
        while (1) {
          f = c[6860] | 0;
          c[6860] = f + 0;
          if (!f) break;
          qd[f & 3]();
          f = Tq(180) | 0;
          if (f) break a;
        }
        l = Wb(4) | 0;
        c[l >> 2] = 27280;
        Zc(l | 0, 27328, 220);
      }
    while (0);
    g = c[(b + 4) >> 2] | 0;
    c[f >> 2] = 528;
    c[(f + 4) >> 2] = g;
    c[(f + 12) >> 2] = 32;
    c[(f + 16) >> 2] = 1;
    c[(f + 20) >> 2] = 8;
    c[(f + 24) >> 2] = 0;
    c[(f + 44) >> 2] = 0;
    c[(f + 48) >> 2] = 0;
    c[(f + 52) >> 2] = 0;
    c[(f + 68) >> 2] = 1;
    c[(f + 72) >> 2] = 2;
    c[(f + 64) >> 2] = 4096;
    c[(f + 60) >> 2] = 4;
    c[(f + 56) >> 2] = 4;
    c[(f + 76) >> 2] = 0;
    c[(f + 80) >> 2] = 0;
    c[(f + 84) >> 2] = 0;
    c[(f + 28) >> 2] = 32;
    c[(f + 32) >> 2] = 0;
    c[(f + 36) >> 2] = -2147483648;
    c[(f + 40) >> 2] = 2147483647;
    c[(f + 8) >> 2] = 0;
    c[(f + 92) >> 2] = 32;
    c[(f + 96) >> 2] = 1;
    c[(f + 100) >> 2] = 8;
    c[(f + 104) >> 2] = 0;
    c[(f + 124) >> 2] = 0;
    c[(f + 128) >> 2] = 0;
    c[(f + 132) >> 2] = 0;
    c[(f + 148) >> 2] = 1;
    c[(f + 152) >> 2] = 2;
    c[(f + 144) >> 2] = 4096;
    c[(f + 140) >> 2] = 4;
    c[(f + 136) >> 2] = 4;
    c[(f + 156) >> 2] = 0;
    c[(f + 160) >> 2] = 0;
    c[(f + 164) >> 2] = 0;
    c[(f + 108) >> 2] = 32;
    c[(f + 112) >> 2] = 0;
    c[(f + 116) >> 2] = -2147483648;
    c[(f + 120) >> 2] = 2147483647;
    c[(f + 88) >> 2] = 0;
    a[(f + 168) >> 0] = 0;
    a[(f + 169) >> 0] = 0;
    a[(f + 176) >> 0] = 0;
    g = (b + 8) | 0;
    c[e >> 2] = f;
    j = Tq(16) | 0;
    b: do
      if (!j) {
        while (1) {
          h = c[6860] | 0;
          c[6860] = h + 0;
          if (!h) break;
          qd[h & 3]();
          j = Tq(16) | 0;
          if (j) break b;
        }
        l = Wb(4) | 0;
        c[l >> 2] = 27280;
        Zc(l | 0, 27328, 220);
      }
    while (0);
    c[(j + 4) >> 2] = 0;
    c[(j + 8) >> 2] = 0;
    c[j >> 2] = 784;
    c[(j + 12) >> 2] = f;
    l = (e + 4) | 0;
    c[l >> 2] = j;
    h = (b + 12) | 0;
    k = c[h >> 2] | 0;
    if (k >>> 0 < (c[(b + 16) >> 2] | 0) >>> 0) {
      if (!k) b = 0;
      else {
        c[k >> 2] = f;
        c[(k + 4) >> 2] = j;
        c[e >> 2] = 0;
        c[l >> 2] = 0;
        b = c[h >> 2] | 0;
        j = 0;
      }
      c[h >> 2] = b + 8;
    } else {
      ve(g, e);
      j = c[l >> 2] | 0;
    }
    if (!j) {
      i = d;
      return;
    }
    k = (j + 4) | 0;
    l = c[k >> 2] | 0;
    c[k >> 2] = l + -1;
    if (l) {
      i = d;
      return;
    }
    jd[c[((c[j >> 2] | 0) + 8) >> 2] & 255](j);
    k = (j + 8) | 0;
    l = c[k >> 2] | 0;
    c[k >> 2] = l + -1;
    if (l) {
      i = d;
      return;
    }
    jd[c[((c[j >> 2] | 0) + 16) >> 2] & 255](j);
    i = d;
    return;
  }
  function be(a) {
    a = a | 0;
    var b = 0;
    b = i;
    c[a >> 2] = 528;
    pe((a + 156) | 0);
    pe((a + 124) | 0);
    oe((a + 8) | 0);
    i = b;
    return;
  }
  function ce(a) {
    a = a | 0;
    var b = 0;
    b = i;
    c[a >> 2] = 528;
    pe((a + 156) | 0);
    pe((a + 124) | 0);
    oe((a + 8) | 0);
    Uq(a);
    i = b;
    return;
  }
  function de(a) {
    a = a | 0;
    return 4;
  }
  function ee(a, b) {
    a = a | 0;
    b = b | 0;
    return;
  }
  function fe(b, e) {
    b = b | 0;
    e = e | 0;
    var f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0;
    f = i;
    j = c[(b + 4) >> 2] | 0;
    if (!(a[(b + 169) >> 0] | 0)) ge((b + 88) | 0);
    g = (b + 172) | 0;
    h = (b + 176) | 0;
    do
      if (a[h >> 0] | 0) {
        k = c[g >> 2] | 0;
        j = ((he((b + 88) | 0, j, c[(b + 124) >> 2] | 0) | 0) + k) | 0;
        b = c[(b + 112) >> 2] | 0;
        if ((j | 0) < 0) {
          b = (j + b) | 0;
          break;
        } else {
          b = (j - (j >>> 0 < b >>> 0 ? 0 : b)) | 0;
          break;
        }
      } else {
        k = c[j >> 2] | 0;
        n = (k + 8) | 0;
        o = c[n >> 2] | 0;
        m = (o + 1) | 0;
        c[n >> 2] = m;
        k = c[k >> 2] | 0;
        l = a[(k + o) >> 0] | 0;
        j = (o + 2) | 0;
        c[n >> 2] = j;
        m = a[(k + m) >> 0] | 0;
        b = (o + 3) | 0;
        c[n >> 2] = b;
        j = a[(k + j) >> 0] | 0;
        c[n >> 2] = o + 4;
        b = ((m & 255) << 8) | (l & 255) | ((j & 255) << 16) | (d[(k + b) >> 0] << 24);
      }
    while (0);
    if (!(a[h >> 0] | 0)) a[h >> 0] = 1;
    c[g >> 2] = b;
    a[(e + 3) >> 0] = b >>> 24;
    a[(e + 2) >> 0] = b >>> 16;
    a[(e + 1) >> 0] = b >>> 8;
    a[e >> 0] = b;
    i = f;
    return;
  }
  function ge(b) {
    b = b | 0;
    var d = 0,
      e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0,
      w = 0,
      x = 0;
    f = i;
    i = (i + 96) | 0;
    h = (f + 44) | 0;
    d = f;
    w = (b + 36) | 0;
    u = (b + 40) | 0;
    if ((c[w >> 2] | 0) != (c[u >> 2] | 0)) {
      i = f;
      return;
    }
    j = (b + 8) | 0;
    e = (b + 20) | 0;
    if (c[j >> 2] | 0) {
      g = (b + 44) | 0;
      n = (h + 4) | 0;
      m = (h + 8) | 0;
      l = (h + 12) | 0;
      k = (h + 16) | 0;
      o = (h + 20) | 0;
      p = (h + 24) | 0;
      q = (h + 28) | 0;
      r = (h + 32) | 0;
      s = (h + 36) | 0;
      t = (h + 40) | 0;
      v = 0;
      do {
        me(h, ((c[e >> 2] | 0) + 1) | 0);
        x = c[u >> 2] | 0;
        if (x >>> 0 < (c[g >> 2] | 0) >>> 0) {
          if (!x) x = 0;
          else {
            c[x >> 2] = c[h >> 2];
            a[(x + 4) >> 0] = a[n >> 0] | 0;
            c[(x + 8) >> 2] = c[m >> 2];
            c[(x + 12) >> 2] = c[l >> 2];
            c[(x + 16) >> 2] = c[k >> 2];
            c[(x + 20) >> 2] = c[o >> 2];
            c[(x + 24) >> 2] = c[p >> 2];
            c[(x + 28) >> 2] = c[q >> 2];
            c[(x + 32) >> 2] = c[r >> 2];
            c[(x + 36) >> 2] = c[s >> 2];
            c[(x + 40) >> 2] = c[t >> 2];
            c[(m + 0) >> 2] = 0;
            c[(m + 4) >> 2] = 0;
            c[(m + 8) >> 2] = 0;
            x = c[u >> 2] | 0;
          }
          c[u >> 2] = x + 44;
        } else ne(w, h);
        x = c[m >> 2] | 0;
        if (x) Uq(c[(x + -4) >> 2] | 0);
        x = c[l >> 2] | 0;
        if (x) Uq(c[(x + -4) >> 2] | 0);
        x = c[k >> 2] | 0;
        if (x) Uq(c[(x + -4) >> 2] | 0);
        v = (v + 1) | 0;
      } while (v >>> 0 < (c[j >> 2] | 0) >>> 0);
    }
    if (!(c[e >> 2] | 0)) {
      i = f;
      return;
    }
    t = (b + 12) | 0;
    k = (b + 72) | 0;
    s = (b + 76) | 0;
    l = (d + 4) | 0;
    j = (d + 8) | 0;
    o = (d + 12) | 0;
    h = (d + 16) | 0;
    m = (d + 20) | 0;
    n = (d + 24) | 0;
    g = (d + 28) | 0;
    p = (d + 32) | 0;
    q = (d + 36) | 0;
    r = (d + 40) | 0;
    b = (b + 68) | 0;
    u = 1;
    do {
      v = c[t >> 2] | 0;
      me(d, 1 << (u >>> 0 > v >>> 0 ? v : u));
      v = c[k >> 2] | 0;
      if (v >>> 0 < (c[s >> 2] | 0) >>> 0) {
        if (!v) v = 0;
        else {
          c[v >> 2] = c[d >> 2];
          a[(v + 4) >> 0] = a[l >> 0] | 0;
          c[(v + 8) >> 2] = c[j >> 2];
          c[(v + 12) >> 2] = c[o >> 2];
          c[(v + 16) >> 2] = c[h >> 2];
          c[(v + 20) >> 2] = c[m >> 2];
          c[(v + 24) >> 2] = c[n >> 2];
          c[(v + 28) >> 2] = c[g >> 2];
          c[(v + 32) >> 2] = c[p >> 2];
          c[(v + 36) >> 2] = c[q >> 2];
          c[(v + 40) >> 2] = c[r >> 2];
          c[(j + 0) >> 2] = 0;
          c[(j + 4) >> 2] = 0;
          c[(j + 8) >> 2] = 0;
          v = c[k >> 2] | 0;
        }
        c[k >> 2] = v + 44;
      } else ne(b, d);
      v = c[j >> 2] | 0;
      if (v) Uq(c[(v + -4) >> 2] | 0);
      v = c[o >> 2] | 0;
      if (v) Uq(c[(v + -4) >> 2] | 0);
      v = c[h >> 2] | 0;
      if (v) Uq(c[(v + -4) >> 2] | 0);
      u = (u + 1) | 0;
    } while (u >>> 0 <= (c[e >> 2] | 0) >>> 0);
    i = f;
    return;
  }
  function he(a, b, e) {
    a = a | 0;
    b = b | 0;
    e = e | 0;
    var f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0;
    f = i;
    g = ie(b, e) | 0;
    c[a >> 2] = g;
    if (g) {
      if (g >>> 0 >= 32) {
        m = c[(a + 28) >> 2] | 0;
        i = f;
        return m | 0;
      }
      e = c[(a + 12) >> 2] | 0;
      if (g >>> 0 > e >>> 0) {
        e = (g - e) | 0;
        m = ie(b, ((c[(a + 68) >> 2] | 0) + ((((g + -1) | 0) * 44) | 0)) | 0) | 0;
        e = (m << e) | (je(b, e) | 0);
      } else e = ie(b, ((c[(a + 68) >> 2] | 0) + ((((g + -1) | 0) * 44) | 0)) | 0) | 0;
      a = c[a >> 2] | 0;
      if ((e | 0) < ((1 << (a + -1)) | 0)) {
        m = (e + 1 + (-1 << a)) | 0;
        i = f;
        return m | 0;
      } else {
        m = (e + 1) | 0;
        i = f;
        return m | 0;
      }
    }
    g = (a + 56) | 0;
    j = (b + 8) | 0;
    m = c[j >> 2] | 0;
    k = da(m >>> 13, c[g >> 2] | 0) | 0;
    h = (b + 4) | 0;
    l = c[h >> 2] | 0;
    n = l >>> 0 >= k >>> 0;
    e = n & 1;
    if (n) {
      c[h >> 2] = l - k;
      k = (m - k) | 0;
      c[j >> 2] = k;
    } else {
      c[j >> 2] = k;
      k = (a + 60) | 0;
      c[k >> 2] = (c[k >> 2] | 0) + 1;
      k = c[j >> 2] | 0;
    }
    if (k >>> 0 < 16777216) {
      k = c[h >> 2] | 0;
      do {
        m = c[b >> 2] | 0;
        l = (m + 8) | 0;
        n = c[l >> 2] | 0;
        c[l >> 2] = n + 1;
        k = d[((c[m >> 2] | 0) + n) >> 0] | 0 | (k << 8);
        c[h >> 2] = k;
        n = c[j >> 2] << 8;
        c[j >> 2] = n;
      } while (n >>> 0 < 16777216);
    }
    j = (a + 52) | 0;
    n = ((c[j >> 2] | 0) + -1) | 0;
    c[j >> 2] = n;
    if (n) {
      n = e;
      i = f;
      return n | 0;
    }
    b = (a + 48) | 0;
    h = c[b >> 2] | 0;
    k = (a + 64) | 0;
    l = ((c[k >> 2] | 0) + h) | 0;
    c[k >> 2] = l;
    if (l >>> 0 > 8192) {
      l = ((l + 1) | 0) >>> 1;
      c[k >> 2] = l;
      n = (a + 60) | 0;
      a = (((c[n >> 2] | 0) + 1) | 0) >>> 1;
      c[n >> 2] = a;
      if ((a | 0) == (l | 0)) {
        n = (l + 1) | 0;
        c[k >> 2] = n;
        k = n;
      } else {
        k = l;
        l = a;
      }
    } else {
      k = l;
      l = c[(a + 60) >> 2] | 0;
    }
    c[g >> 2] = (da((2147483648 / (k >>> 0)) | 0, l) | 0) >>> 18;
    n = (h * 5) | 0;
    n = n >>> 0 > 259 ? 64 : n >>> 2;
    c[b >> 2] = n;
    c[j >> 2] = n;
    n = e;
    i = f;
    return n | 0;
  }
  function ie(a, b) {
    a = a | 0;
    b = b | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0;
    f = i;
    e = (a + 8) | 0;
    g = c[e >> 2] | 0;
    j = c[(b + 16) >> 2] | 0;
    if (j) {
      k = c[(a + 4) >> 2] | 0;
      h = g >>> 15;
      c[e >> 2] = h;
      m = ((k >>> 0) / (h >>> 0)) | 0;
      n = m >>> (c[(b + 40) >> 2] | 0);
      l = c[(j + (n << 2)) >> 2] | 0;
      n = ((c[(j + ((n + 1) << 2)) >> 2] | 0) + 1) | 0;
      o = (l + 1) | 0;
      j = c[(b + 8) >> 2] | 0;
      if (n >>> 0 > o >>> 0) {
        do {
          o = ((n + l) | 0) >>> 1;
          p = (c[(j + (o << 2)) >> 2] | 0) >>> 0 > m >>> 0;
          l = p ? l : o;
          n = p ? o : n;
          o = (l + 1) | 0;
        } while (n >>> 0 > o >>> 0);
        m = o;
      } else m = o;
      o = da(h, c[(j + (l << 2)) >> 2] | 0) | 0;
      if ((l | 0) != (c[(b + 32) >> 2] | 0)) g = da(c[(j + (m << 2)) >> 2] | 0, h) | 0;
    } else {
      j = g >>> 15;
      c[e >> 2] = j;
      m = c[b >> 2] | 0;
      h = c[(b + 8) >> 2] | 0;
      k = c[(a + 4) >> 2] | 0;
      n = m >>> 1;
      l = 0;
      o = 0;
      do {
        q = da(c[(h + (n << 2)) >> 2] | 0, j) | 0;
        p = q >>> 0 > k >>> 0;
        g = p ? q : g;
        o = p ? o : q;
        l = p ? l : n;
        m = p ? n : m;
        n = ((l + m) | 0) >>> 1;
      } while ((n | 0) != (l | 0));
    }
    h = (a + 4) | 0;
    j = (k - o) | 0;
    c[h >> 2] = j;
    q = (g - o) | 0;
    c[e >> 2] = q;
    if (q >>> 0 < 16777216)
      do {
        p = c[a >> 2] | 0;
        o = (p + 8) | 0;
        q = c[o >> 2] | 0;
        c[o >> 2] = q + 1;
        j = d[((c[p >> 2] | 0) + q) >> 0] | 0 | (j << 8);
        c[h >> 2] = j;
        q = c[e >> 2] << 8;
        c[e >> 2] = q;
      } while (q >>> 0 < 16777216);
    p = ((c[(b + 12) >> 2] | 0) + (l << 2)) | 0;
    c[p >> 2] = (c[p >> 2] | 0) + 1;
    p = (b + 28) | 0;
    q = ((c[p >> 2] | 0) + -1) | 0;
    c[p >> 2] = q;
    if (q) {
      i = f;
      return l | 0;
    }
    ke(b);
    i = f;
    return l | 0;
  }
  function je(a, b) {
    a = a | 0;
    b = b | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0;
    g = i;
    e = (a + 4) | 0;
    h = c[e >> 2] | 0;
    f = (a + 8) | 0;
    j = c[f >> 2] | 0;
    if (b >>> 0 > 19) {
      k = j >>> 16;
      c[f >> 2] = k;
      j = ((h >>> 0) / (k >>> 0)) | 0;
      h = (h - (da(j, k) | 0)) | 0;
      c[e >> 2] = h;
      do {
        l = c[a >> 2] | 0;
        m = (l + 8) | 0;
        k = c[m >> 2] | 0;
        c[m >> 2] = k + 1;
        h = d[((c[l >> 2] | 0) + k) >> 0] | 0 | (h << 8);
        c[e >> 2] = h;
        k = c[f >> 2] << 8;
        c[f >> 2] = k;
      } while (k >>> 0 < 16777216);
      m = ((je(a, (b + -16) | 0) | 0) << 16) | (j & 65535);
      i = g;
      return m | 0;
    }
    m = j >>> b;
    c[f >> 2] = m;
    b = ((h >>> 0) / (m >>> 0)) | 0;
    h = (h - (da(b, m) | 0)) | 0;
    c[e >> 2] = h;
    if (m >>> 0 >= 16777216) {
      i = g;
      return b | 0;
    }
    do {
      l = c[a >> 2] | 0;
      k = (l + 8) | 0;
      m = c[k >> 2] | 0;
      c[k >> 2] = m + 1;
      h = d[((c[l >> 2] | 0) + m) >> 0] | 0 | (h << 8);
      c[e >> 2] = h;
      m = c[f >> 2] << 8;
      c[f >> 2] = m;
    } while (m >>> 0 < 16777216);
    i = g;
    return b | 0;
  }
  function ke(b) {
    b = b | 0;
    var d = 0,
      e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0;
    d = i;
    e = (b + 24) | 0;
    h = (b + 20) | 0;
    k = ((c[h >> 2] | 0) + (c[e >> 2] | 0)) | 0;
    c[h >> 2] = k;
    if (k >>> 0 > 32768) {
      c[h >> 2] = 0;
      if (!(c[b >> 2] | 0)) k = 0;
      else {
        l = c[(b + 12) >> 2] | 0;
        j = 0;
        do {
          s = (l + (j << 2)) | 0;
          k = (((c[s >> 2] | 0) + 1) | 0) >>> 1;
          c[s >> 2] = k;
          k = (k + (c[h >> 2] | 0)) | 0;
          c[h >> 2] = k;
          j = (j + 1) | 0;
        } while (j >>> 0 < (c[b >> 2] | 0) >>> 0);
      }
    }
    h = (2147483648 / (k >>> 0)) | 0;
    if ((a[(b + 4) >> 0] | 0) == 0 ? ((f = (b + 36) | 0), (c[f >> 2] | 0) != 0) : 0) {
      if (c[b >> 2] | 0) {
        o = c[(b + 8) >> 2] | 0;
        m = c[(b + 12) >> 2] | 0;
        k = (b + 40) | 0;
        n = (b + 16) | 0;
        j = 0;
        s = 0;
        l = 0;
        while (1) {
          r = (da(l, h) | 0) >>> 16;
          c[(o + (j << 2)) >> 2] = r;
          l = ((c[(m + (j << 2)) >> 2] | 0) + l) | 0;
          r = r >>> (c[k >> 2] | 0);
          if (s >>> 0 < r >>> 0) {
            p = (j + -1) | 0;
            q = c[n >> 2] | 0;
            do {
              s = (s + 1) | 0;
              c[(q + (s << 2)) >> 2] = p;
            } while ((s | 0) != (r | 0));
          } else r = s;
          j = (j + 1) | 0;
          if (j >>> 0 >= (c[b >> 2] | 0) >>> 0) break;
          else s = r;
        }
        h = c[n >> 2] | 0;
        c[h >> 2] = 0;
        if (r >>> 0 <= (c[f >> 2] | 0) >>> 0) g = 18;
      } else {
        h = c[(b + 16) >> 2] | 0;
        c[h >> 2] = 0;
        r = 0;
        g = 18;
      }
      if ((g | 0) == 18)
        do {
          r = (r + 1) | 0;
          c[(h + (r << 2)) >> 2] = (c[b >> 2] | 0) + -1;
        } while (r >>> 0 <= (c[f >> 2] | 0) >>> 0);
      s = c[b >> 2] | 0;
      r = c[e >> 2] | 0;
      r = (r * 5) | 0;
      r = r >>> 2;
      s = s << 3;
      s = (s + 48) | 0;
      q = r >>> 0 > s >>> 0;
      r = q ? s : r;
      c[e >> 2] = r;
      s = (b + 28) | 0;
      c[s >> 2] = r;
      i = d;
      return;
    }
    if (!(c[b >> 2] | 0)) {
      s = 0;
      r = c[e >> 2] | 0;
      r = (r * 5) | 0;
      r = r >>> 2;
      s = s << 3;
      s = (s + 48) | 0;
      q = r >>> 0 > s >>> 0;
      r = q ? s : r;
      c[e >> 2] = r;
      s = (b + 28) | 0;
      c[s >> 2] = r;
      i = d;
      return;
    }
    j = c[(b + 8) >> 2] | 0;
    k = c[(b + 12) >> 2] | 0;
    l = 0;
    g = 0;
    do {
      c[(j + (l << 2)) >> 2] = (da(g, h) | 0) >>> 16;
      g = ((c[(k + (l << 2)) >> 2] | 0) + g) | 0;
      l = (l + 1) | 0;
      f = c[b >> 2] | 0;
    } while (l >>> 0 < f >>> 0);
    r = c[e >> 2] | 0;
    r = (r * 5) | 0;
    r = r >>> 2;
    s = f << 3;
    s = (s + 48) | 0;
    q = r >>> 0 > s >>> 0;
    r = q ? s : r;
    c[e >> 2] = r;
    s = (b + 28) | 0;
    c[s >> 2] = r;
    i = d;
    return;
  }
  function le(a) {
    a = a | 0;
    Oa(a | 0) | 0;
    eq();
  }
  function me(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0;
    f = i;
    c[b >> 2] = d;
    a[(b + 4) >> 0] = 0;
    j = (b + 8) | 0;
    c[j >> 2] = 0;
    g = (b + 12) | 0;
    c[g >> 2] = 0;
    h = (b + 16) | 0;
    c[h >> 2] = 0;
    if (((d + -2) | 0) >>> 0 > 2046) {
      b = Wb(8) | 0;
      c[b >> 2] = 27520;
      f = (b + 4) | 0;
      d = Tq(38) | 0;
      if (d) {
        e = d;
        c[e >> 2] = 25;
        g = (e + 4) | 0;
        c[g >> 2] = 25;
        g = (e + 8) | 0;
        c[g >> 2] = 0;
        e = (e + 12) | 0;
        g = (e + 0) | 0;
        d = 744 | 0;
        h = (g + 26) | 0;
        do {
          a[g >> 0] = a[d >> 0] | 0;
          g = (g + 1) | 0;
          d = (d + 1) | 0;
        } while ((g | 0) < (h | 0));
        c[f >> 2] = e;
        Zc(b | 0, 27720, 224);
      }
      while (1) {
        d = c[6860] | 0;
        c[6860] = d + 0;
        if (!d) break;
        qd[d & 3]();
        d = Tq(38) | 0;
        if (d) {
          e = 8;
          break;
        }
      }
      if ((e | 0) == 8) {
        c[d >> 2] = 25;
        e = (d + 4) | 0;
        c[e >> 2] = 25;
        e = (d + 8) | 0;
        c[e >> 2] = 0;
        e = (d + 12) | 0;
        g = (e + 0) | 0;
        d = 744 | 0;
        h = (g + 26) | 0;
        do {
          a[g >> 0] = a[d >> 0] | 0;
          g = (g + 1) | 0;
          d = (d + 1) | 0;
        } while ((g | 0) < (h | 0));
        c[f >> 2] = e;
        Zc(b | 0, 27720, 224);
      }
      j = Wb(4) | 0;
      c[j >> 2] = 27280;
      Zc(j | 0, 27328, 220);
    } else {
      c[(b + 32) >> 2] = d + -1;
      if (d >>> 0 > 16) {
        e = 3;
        while (1)
          if ((1 << (e + 2)) >>> 0 < d >>> 0) e = (e + 1) | 0;
          else break;
        k = 1 << e;
        c[(b + 36) >> 2] = k;
        c[(b + 40) >> 2] = 15 - e;
        k = Tq(((k << 2) + 76) | 0) | 0;
        e = (k + 68) & -64;
        c[(e + -4) >> 2] = k;
        c[h >> 2] = e;
      } else {
        c[h >> 2] = 0;
        c[(b + 40) >> 2] = 0;
        c[(b + 36) >> 2] = 0;
      }
      k = ((d << 2) + 68) | 0;
      h = Tq(k) | 0;
      e = (h + 68) & -64;
      c[(e + -4) >> 2] = h;
      c[j >> 2] = e;
      k = Tq(k) | 0;
      e = (k + 68) & -64;
      c[(e + -4) >> 2] = k;
      c[g >> 2] = e;
      c[(b + 20) >> 2] = 0;
      g = (b + 24) | 0;
      c[g >> 2] = d;
      if (!d) {
        ke(b);
        j = c[b >> 2] | 0;
        j = (j + 6) | 0;
        j = j >>> 1;
        c[g >> 2] = j;
        k = (b + 28) | 0;
        c[k >> 2] = j;
        i = f;
        return;
      } else d = 0;
      do {
        c[(e + (d << 2)) >> 2] = 1;
        d = (d + 1) | 0;
      } while (d >>> 0 < (c[b >> 2] | 0) >>> 0);
      ke(b);
      j = c[b >> 2] | 0;
      j = (j + 6) | 0;
      j = j >>> 1;
      c[g >> 2] = j;
      k = (b + 28) | 0;
      c[k >> 2] = j;
      i = f;
      return;
    }
  }
  function ne(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0;
    e = i;
    f = (b + 4) | 0;
    l = c[f >> 2] | 0;
    k = c[b >> 2] | 0;
    m = k;
    h = (((l - m) | 0) / 44) | 0;
    j = (h + 1) | 0;
    if (j >>> 0 > 97612893) Mn();
    g = (b + 8) | 0;
    m = ((((c[g >> 2] | 0) - m) | 0) / 44) | 0;
    if (m >>> 0 < 48806446) {
      o = m << 1;
      o = o >>> 0 < j >>> 0 ? j : o;
      if (!o) {
        p = 0;
        m = 0;
      } else n = 5;
    } else {
      o = 97612893;
      n = 5;
    }
    if ((n | 0) == 5) {
      n = (o * 44) | 0;
      n = (n | 0) == 0 ? 1 : n;
      m = Tq(n) | 0;
      a: do
        if (!m) {
          while (1) {
            m = c[6860] | 0;
            c[6860] = m + 0;
            if (!m) break;
            qd[m & 3]();
            m = Tq(n) | 0;
            if (m) break a;
          }
          p = Wb(4) | 0;
          c[p >> 2] = 27280;
          Zc(p | 0, 27328, 220);
        }
      while (0);
      p = o;
    }
    o = (m + ((h * 44) | 0)) | 0;
    n = (m + ((p * 44) | 0)) | 0;
    if (o) {
      c[o >> 2] = c[d >> 2];
      a[(m + ((h * 44) | 0) + 4) >> 0] = a[(d + 4) >> 0] | 0;
      l = (d + 8) | 0;
      c[(m + ((h * 44) | 0) + 8) >> 2] = c[l >> 2];
      c[(m + ((h * 44) | 0) + 12) >> 2] = c[(d + 12) >> 2];
      c[(m + ((h * 44) | 0) + 16) >> 2] = c[(d + 16) >> 2];
      c[(m + ((h * 44) | 0) + 20) >> 2] = c[(d + 20) >> 2];
      c[(m + ((h * 44) | 0) + 24) >> 2] = c[(d + 24) >> 2];
      c[(m + ((h * 44) | 0) + 28) >> 2] = c[(d + 28) >> 2];
      c[(m + ((h * 44) | 0) + 32) >> 2] = c[(d + 32) >> 2];
      c[(m + ((h * 44) | 0) + 36) >> 2] = c[(d + 36) >> 2];
      c[(m + ((h * 44) | 0) + 40) >> 2] = c[(d + 40) >> 2];
      c[(l + 0) >> 2] = 0;
      c[(l + 4) >> 2] = 0;
      c[(l + 8) >> 2] = 0;
      l = c[f >> 2] | 0;
      k = c[b >> 2] | 0;
    }
    j = (m + ((j * 44) | 0)) | 0;
    if ((l | 0) != (k | 0)) {
      h = (h + -1 - (((((l + -44 + (0 - k)) | 0) >>> 0) / 44) | 0)) | 0;
      while (1) {
        d = l;
        l = (l + -44) | 0;
        c[(o + -44) >> 2] = c[l >> 2];
        a[(o + -40) >> 0] = a[(d + -40) >> 0] | 0;
        p = (d + -36) | 0;
        c[(o + -36) >> 2] = c[p >> 2];
        c[(o + -32) >> 2] = c[(d + -32) >> 2];
        c[(o + -28) >> 2] = c[(d + -28) >> 2];
        c[(o + -24) >> 2] = c[(d + -24) >> 2];
        c[(o + -20) >> 2] = c[(d + -20) >> 2];
        c[(o + -16) >> 2] = c[(d + -16) >> 2];
        c[(o + -12) >> 2] = c[(d + -12) >> 2];
        c[(o + -8) >> 2] = c[(d + -8) >> 2];
        c[(o + -4) >> 2] = c[(d + -4) >> 2];
        c[(p + 0) >> 2] = 0;
        c[(p + 4) >> 2] = 0;
        c[(p + 8) >> 2] = 0;
        if ((l | 0) == (k | 0)) break;
        else o = (o + -44) | 0;
      }
      l = c[b >> 2] | 0;
      k = c[f >> 2] | 0;
      c[b >> 2] = m + ((h * 44) | 0);
      c[f >> 2] = j;
      c[g >> 2] = n;
      if ((k | 0) != (l | 0))
        do {
          b = c[(k + -36) >> 2] | 0;
          if (b) Uq(c[(b + -4) >> 2] | 0);
          b = c[(k + -32) >> 2] | 0;
          if (b) Uq(c[(b + -4) >> 2] | 0);
          b = c[(k + -28) >> 2] | 0;
          k = (k + -44) | 0;
          if (b) Uq(c[(b + -4) >> 2] | 0);
        } while ((k | 0) != (l | 0));
    } else {
      c[b >> 2] = o;
      c[f >> 2] = j;
      c[g >> 2] = n;
    }
    if (!l) {
      i = e;
      return;
    }
    Uq(l);
    i = e;
    return;
  }
  function oe(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0,
      f = 0,
      g = 0,
      h = 0;
    b = i;
    d = (a + 36) | 0;
    e = c[d >> 2] | 0;
    f = (a + 40) | 0;
    g = c[f >> 2] | 0;
    if ((g | 0) != (e | 0))
      do {
        c[f >> 2] = g + -44;
        h = c[(g + -36) >> 2] | 0;
        if (h) Uq(c[(h + -4) >> 2] | 0);
        h = c[(g + -32) >> 2] | 0;
        if (h) Uq(c[(h + -4) >> 2] | 0);
        g = c[(g + -28) >> 2] | 0;
        if (g) Uq(c[(g + -4) >> 2] | 0);
        g = c[f >> 2] | 0;
      } while ((g | 0) != (e | 0));
    f = (a + 68) | 0;
    e = c[f >> 2] | 0;
    a = (a + 72) | 0;
    g = c[a >> 2] | 0;
    if ((g | 0) == (e | 0)) {
      pe(f);
      pe(d);
      i = b;
      return;
    }
    do {
      c[a >> 2] = g + -44;
      h = c[(g + -36) >> 2] | 0;
      if (h) Uq(c[(h + -4) >> 2] | 0);
      h = c[(g + -32) >> 2] | 0;
      if (h) Uq(c[(h + -4) >> 2] | 0);
      g = c[(g + -28) >> 2] | 0;
      if (g) Uq(c[(g + -4) >> 2] | 0);
      g = c[a >> 2] | 0;
    } while ((g | 0) != (e | 0));
    pe(f);
    pe(d);
    i = b;
    return;
  }
  function pe(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0,
      f = 0,
      g = 0;
    b = i;
    d = c[a >> 2] | 0;
    if (!d) {
      i = b;
      return;
    }
    e = (a + 4) | 0;
    f = c[e >> 2] | 0;
    if ((f | 0) != (d | 0)) {
      do {
        c[e >> 2] = f + -44;
        g = c[(f + -36) >> 2] | 0;
        if (g) Uq(c[(g + -4) >> 2] | 0);
        g = c[(f + -32) >> 2] | 0;
        if (g) Uq(c[(g + -4) >> 2] | 0);
        f = c[(f + -28) >> 2] | 0;
        if (f) Uq(c[(f + -4) >> 2] | 0);
        f = c[e >> 2] | 0;
      } while ((f | 0) != (d | 0));
      d = c[a >> 2] | 0;
    }
    Uq(d);
    i = b;
    return;
  }
  function qe(a) {
    a = a | 0;
    return;
  }
  function re(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function se(a) {
    a = a | 0;
    var b = 0;
    b = i;
    a = c[(a + 12) >> 2] | 0;
    if (!a) {
      i = b;
      return;
    }
    jd[c[((c[a >> 2] | 0) + 4) >> 2] & 255](a);
    i = b;
    return;
  }
  function te(a, b) {
    a = a | 0;
    b = b | 0;
    if ((c[(b + 4) >> 2] | 0) == 1040) a = (a + 12) | 0;
    else a = 0;
    return a | 0;
  }
  function ue(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function ve(a, b) {
    a = a | 0;
    b = b | 0;
    var d = 0,
      e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0;
    d = i;
    f = (a + 4) | 0;
    k = c[f >> 2] | 0;
    j = c[a >> 2] | 0;
    l = j;
    g = (k - l) >> 3;
    h = (g + 1) | 0;
    if (h >>> 0 > 536870911) Mn();
    e = (a + 8) | 0;
    l = ((c[e >> 2] | 0) - l) | 0;
    if ((l >> 3) >>> 0 < 268435455) {
      n = l >> 2;
      n = n >>> 0 < h >>> 0 ? h : n;
      if (!n) {
        o = 0;
        l = 0;
      } else m = 5;
    } else {
      n = 536870911;
      m = 5;
    }
    if ((m | 0) == 5) {
      m = n << 3;
      m = (m | 0) == 0 ? 1 : m;
      l = Tq(m) | 0;
      a: do
        if (!l) {
          while (1) {
            l = c[6860] | 0;
            c[6860] = l + 0;
            if (!l) break;
            qd[l & 3]();
            l = Tq(m) | 0;
            if (l) break a;
          }
          o = Wb(4) | 0;
          c[o >> 2] = 27280;
          Zc(o | 0, 27328, 220);
        }
      while (0);
      o = n;
    }
    n = (l + (g << 3)) | 0;
    m = (l + (o << 3)) | 0;
    if (n) {
      c[n >> 2] = c[b >> 2];
      k = (b + 4) | 0;
      c[(l + (g << 3) + 4) >> 2] = c[k >> 2];
      c[b >> 2] = 0;
      c[k >> 2] = 0;
      k = c[f >> 2] | 0;
      j = c[a >> 2] | 0;
    }
    h = (l + (h << 3)) | 0;
    if ((k | 0) != (j | 0)) {
      g = (g + -1 - (((k + -8 + (0 - j)) | 0) >>> 3)) | 0;
      while (1) {
        o = k;
        k = (k + -8) | 0;
        c[(n + -8) >> 2] = c[k >> 2];
        o = (o + -4) | 0;
        c[(n + -4) >> 2] = c[o >> 2];
        c[k >> 2] = 0;
        c[o >> 2] = 0;
        if ((k | 0) == (j | 0)) break;
        else n = (n + -8) | 0;
      }
      k = c[a >> 2] | 0;
      j = c[f >> 2] | 0;
      c[a >> 2] = l + (g << 3);
      c[f >> 2] = h;
      c[e >> 2] = m;
      if ((j | 0) != (k | 0))
        do {
          a = c[(j + -4) >> 2] | 0;
          j = (j + -8) | 0;
          if (
            ((a | 0) != 0
            ? ((n = (a + 4) | 0), (o = c[n >> 2] | 0), (c[n >> 2] = o + -1), (o | 0) == 0)
            : 0)
              ? (jd[c[((c[a >> 2] | 0) + 8) >> 2] & 255](a),
                (n = (a + 8) | 0),
                (o = c[n >> 2] | 0),
                (c[n >> 2] = o + -1),
                (o | 0) == 0)
              : 0
          )
            jd[c[((c[a >> 2] | 0) + 16) >> 2] & 255](a);
        } while ((j | 0) != (k | 0));
    } else {
      c[a >> 2] = n;
      c[f >> 2] = h;
      c[e >> 2] = m;
    }
    if (!k) {
      i = d;
      return;
    }
    Uq(k);
    i = d;
    return;
  }
  function we(a) {
    a = a | 0;
    var b = 0;
    b = i;
    c[a >> 2] = 1208;
    pe((a + 156) | 0);
    pe((a + 124) | 0);
    oe((a + 8) | 0);
    i = b;
    return;
  }
  function xe(a) {
    a = a | 0;
    var b = 0;
    b = i;
    c[a >> 2] = 1208;
    pe((a + 156) | 0);
    pe((a + 124) | 0);
    oe((a + 8) | 0);
    Uq(a);
    i = b;
    return;
  }
  function ye(a) {
    a = a | 0;
    return 2;
  }
  function ze(d, f) {
    d = d | 0;
    f = f | 0;
    var g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0;
    g = i;
    k = c[(d + 4) >> 2] | 0;
    if (!(a[(d + 169) >> 0] | 0)) ge((d + 88) | 0);
    h = (d + 170) | 0;
    j = (d + 172) | 0;
    do
      if (a[j >> 0] | 0) {
        l = e[h >> 1] | 0;
        k = ((he((d + 88) | 0, k, c[(d + 124) >> 2] | 0) | 0) + l) | 0;
        d = c[(d + 112) >> 2] | 0;
        if ((k | 0) < 0) {
          k = (k + d) | 0;
          break;
        } else {
          k = (k - (k >>> 0 < d >>> 0 ? 0 : d)) | 0;
          break;
        }
      } else {
        d = c[k >> 2] | 0;
        m = (d + 8) | 0;
        n = c[m >> 2] | 0;
        l = (n + 1) | 0;
        c[m >> 2] = l;
        d = c[d >> 2] | 0;
        k = a[(d + n) >> 0] | 0;
        c[m >> 2] = n + 2;
        k = (a[(d + l) >> 0] << 8) | (k & 255);
      }
    while (0);
    d = k & 65535;
    if (a[j >> 0] | 0) {
      b[h >> 1] = d;
      m = (d & 65535) >>> 8;
      m = m & 255;
      n = (f + 1) | 0;
      a[n >> 0] = m;
      n = k & 255;
      a[f >> 0] = n;
      i = g;
      return;
    }
    a[j >> 0] = 1;
    b[h >> 1] = d;
    m = (d & 65535) >>> 8;
    m = m & 255;
    n = (f + 1) | 0;
    a[n >> 0] = m;
    n = k & 255;
    a[f >> 0] = n;
    i = g;
    return;
  }
  function Ae(a) {
    a = a | 0;
    return;
  }
  function Be(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function Ce(a) {
    a = a | 0;
    var b = 0;
    b = i;
    a = c[(a + 12) >> 2] | 0;
    if (!a) {
      i = b;
      return;
    }
    jd[c[((c[a >> 2] | 0) + 4) >> 2] & 255](a);
    i = b;
    return;
  }
  function De(a, b) {
    a = a | 0;
    b = b | 0;
    if ((c[(b + 4) >> 2] | 0) == 1648) a = (a + 12) | 0;
    else a = 0;
    return a | 0;
  }
  function Ee(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function Fe(a) {
    a = a | 0;
    var b = 0;
    b = i;
    c[a >> 2] = 1816;
    pe((a + 156) | 0);
    pe((a + 124) | 0);
    oe((a + 8) | 0);
    i = b;
    return;
  }
  function Ge(a) {
    a = a | 0;
    var b = 0;
    b = i;
    c[a >> 2] = 1816;
    pe((a + 156) | 0);
    pe((a + 124) | 0);
    oe((a + 8) | 0);
    Uq(a);
    i = b;
    return;
  }
  function He(a) {
    a = a | 0;
    return 1;
  }
  function Ie(b, e) {
    b = b | 0;
    e = e | 0;
    var f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0;
    f = i;
    j = c[(b + 4) >> 2] | 0;
    if (!(a[(b + 169) >> 0] | 0)) ge((b + 88) | 0);
    h = (b + 170) | 0;
    g = (b + 171) | 0;
    if (a[g >> 0] | 0) {
      k = d[h >> 0] | 0;
      j = ((he((b + 88) | 0, j, c[(b + 124) >> 2] | 0) | 0) + k) | 0;
      b = c[(b + 112) >> 2] | 0;
      if ((j | 0) < 0) b = (j + b) | 0;
      else b = (j - (j >>> 0 < b >>> 0 ? 0 : b)) | 0;
      b = b & 255;
      if (a[g >> 0] | 0) {
        j = h;
        k = b;
        a[j >> 0] = k;
        a[e >> 0] = k;
        i = f;
        return;
      }
    } else {
      k = c[j >> 2] | 0;
      j = (k + 8) | 0;
      b = c[j >> 2] | 0;
      c[j >> 2] = b + 1;
      b = a[((c[k >> 2] | 0) + b) >> 0] | 0;
    }
    a[g >> 0] = 1;
    j = h;
    k = b;
    a[j >> 0] = k;
    a[e >> 0] = k;
    i = f;
    return;
  }
  function Je(a) {
    a = a | 0;
    return;
  }
  function Ke(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function Le(a) {
    a = a | 0;
    var b = 0;
    b = i;
    a = c[(a + 12) >> 2] | 0;
    if (!a) {
      i = b;
      return;
    }
    jd[c[((c[a >> 2] | 0) + 4) >> 2] & 255](a);
    i = b;
    return;
  }
  function Me(a, b) {
    a = a | 0;
    b = b | 0;
    if ((c[(b + 4) >> 2] | 0) == 2256) a = (a + 12) | 0;
    else a = 0;
    return a | 0;
  }
  function Ne(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function Oe(b) {
    b = b | 0;
    var d = 0,
      e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0;
    d = i;
    i = (i + 16) | 0;
    e = d;
    f = Tq(180) | 0;
    a: do
      if (!f) {
        while (1) {
          f = c[6860] | 0;
          c[6860] = f + 0;
          if (!f) break;
          qd[f & 3]();
          f = Tq(180) | 0;
          if (f) break a;
        }
        l = Wb(4) | 0;
        c[l >> 2] = 27280;
        Zc(l | 0, 27328, 220);
      }
    while (0);
    g = c[(b + 4) >> 2] | 0;
    c[f >> 2] = 2424;
    c[(f + 4) >> 2] = g;
    c[(f + 12) >> 2] = 32;
    c[(f + 16) >> 2] = 1;
    c[(f + 20) >> 2] = 8;
    c[(f + 24) >> 2] = 0;
    c[(f + 44) >> 2] = 0;
    c[(f + 48) >> 2] = 0;
    c[(f + 52) >> 2] = 0;
    c[(f + 68) >> 2] = 1;
    c[(f + 72) >> 2] = 2;
    c[(f + 64) >> 2] = 4096;
    c[(f + 60) >> 2] = 4;
    c[(f + 56) >> 2] = 4;
    c[(f + 76) >> 2] = 0;
    c[(f + 80) >> 2] = 0;
    c[(f + 84) >> 2] = 0;
    c[(f + 28) >> 2] = 32;
    c[(f + 32) >> 2] = 0;
    c[(f + 36) >> 2] = -2147483648;
    c[(f + 40) >> 2] = 2147483647;
    c[(f + 8) >> 2] = 0;
    c[(f + 92) >> 2] = 32;
    c[(f + 96) >> 2] = 1;
    c[(f + 100) >> 2] = 8;
    c[(f + 104) >> 2] = 0;
    c[(f + 124) >> 2] = 0;
    c[(f + 128) >> 2] = 0;
    c[(f + 132) >> 2] = 0;
    c[(f + 148) >> 2] = 1;
    c[(f + 152) >> 2] = 2;
    c[(f + 144) >> 2] = 4096;
    c[(f + 140) >> 2] = 4;
    c[(f + 136) >> 2] = 4;
    c[(f + 156) >> 2] = 0;
    c[(f + 160) >> 2] = 0;
    c[(f + 164) >> 2] = 0;
    c[(f + 108) >> 2] = 32;
    c[(f + 112) >> 2] = 0;
    c[(f + 116) >> 2] = -2147483648;
    c[(f + 120) >> 2] = 2147483647;
    c[(f + 88) >> 2] = 0;
    a[(f + 168) >> 0] = 0;
    a[(f + 169) >> 0] = 0;
    a[(f + 176) >> 0] = 0;
    g = (b + 8) | 0;
    c[e >> 2] = f;
    j = Tq(16) | 0;
    b: do
      if (!j) {
        while (1) {
          h = c[6860] | 0;
          c[6860] = h + 0;
          if (!h) break;
          qd[h & 3]();
          j = Tq(16) | 0;
          if (j) break b;
        }
        l = Wb(4) | 0;
        c[l >> 2] = 27280;
        Zc(l | 0, 27328, 220);
      }
    while (0);
    c[(j + 4) >> 2] = 0;
    c[(j + 8) >> 2] = 0;
    c[j >> 2] = 2608;
    c[(j + 12) >> 2] = f;
    l = (e + 4) | 0;
    c[l >> 2] = j;
    h = (b + 12) | 0;
    k = c[h >> 2] | 0;
    if (k >>> 0 < (c[(b + 16) >> 2] | 0) >>> 0) {
      if (!k) b = 0;
      else {
        c[k >> 2] = f;
        c[(k + 4) >> 2] = j;
        c[e >> 2] = 0;
        c[l >> 2] = 0;
        b = c[h >> 2] | 0;
        j = 0;
      }
      c[h >> 2] = b + 8;
    } else {
      ve(g, e);
      j = c[l >> 2] | 0;
    }
    if (!j) {
      i = d;
      return;
    }
    k = (j + 4) | 0;
    l = c[k >> 2] | 0;
    c[k >> 2] = l + -1;
    if (l) {
      i = d;
      return;
    }
    jd[c[((c[j >> 2] | 0) + 8) >> 2] & 255](j);
    k = (j + 8) | 0;
    l = c[k >> 2] | 0;
    c[k >> 2] = l + -1;
    if (l) {
      i = d;
      return;
    }
    jd[c[((c[j >> 2] | 0) + 16) >> 2] & 255](j);
    i = d;
    return;
  }
  function Pe(a) {
    a = a | 0;
    var b = 0;
    b = i;
    c[a >> 2] = 2424;
    pe((a + 156) | 0);
    pe((a + 124) | 0);
    oe((a + 8) | 0);
    i = b;
    return;
  }
  function Qe(a) {
    a = a | 0;
    var b = 0;
    b = i;
    c[a >> 2] = 2424;
    pe((a + 156) | 0);
    pe((a + 124) | 0);
    oe((a + 8) | 0);
    Uq(a);
    i = b;
    return;
  }
  function Re(a) {
    a = a | 0;
    return 4;
  }
  function Se(b, e) {
    b = b | 0;
    e = e | 0;
    var f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0;
    f = i;
    j = c[(b + 4) >> 2] | 0;
    if (!(a[(b + 169) >> 0] | 0)) ge((b + 88) | 0);
    g = (b + 172) | 0;
    h = (b + 176) | 0;
    do
      if (a[h >> 0] | 0) {
        k = c[g >> 2] | 0;
        j = ((he((b + 88) | 0, j, c[(b + 124) >> 2] | 0) | 0) + k) | 0;
        b = c[(b + 112) >> 2] | 0;
        if ((j | 0) < 0) {
          b = (j + b) | 0;
          break;
        } else {
          b = (j - (j >>> 0 < b >>> 0 ? 0 : b)) | 0;
          break;
        }
      } else {
        k = c[j >> 2] | 0;
        n = (k + 8) | 0;
        o = c[n >> 2] | 0;
        m = (o + 1) | 0;
        c[n >> 2] = m;
        k = c[k >> 2] | 0;
        l = a[(k + o) >> 0] | 0;
        j = (o + 2) | 0;
        c[n >> 2] = j;
        m = a[(k + m) >> 0] | 0;
        b = (o + 3) | 0;
        c[n >> 2] = b;
        j = a[(k + j) >> 0] | 0;
        c[n >> 2] = o + 4;
        b = ((m & 255) << 8) | (l & 255) | ((j & 255) << 16) | (d[(k + b) >> 0] << 24);
      }
    while (0);
    if (!(a[h >> 0] | 0)) a[h >> 0] = 1;
    c[g >> 2] = b;
    a[(e + 3) >> 0] = b >>> 24;
    a[(e + 2) >> 0] = b >>> 16;
    a[(e + 1) >> 0] = b >>> 8;
    a[e >> 0] = b;
    i = f;
    return;
  }
  function Te(a) {
    a = a | 0;
    return;
  }
  function Ue(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function Ve(a) {
    a = a | 0;
    var b = 0;
    b = i;
    a = c[(a + 12) >> 2] | 0;
    if (!a) {
      i = b;
      return;
    }
    jd[c[((c[a >> 2] | 0) + 4) >> 2] & 255](a);
    i = b;
    return;
  }
  function We(a, b) {
    a = a | 0;
    b = b | 0;
    if ((c[(b + 4) >> 2] | 0) == 2864) a = (a + 12) | 0;
    else a = 0;
    return a | 0;
  }
  function Xe(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function Ye(a) {
    a = a | 0;
    var b = 0;
    b = i;
    c[a >> 2] = 3032;
    pe((a + 156) | 0);
    pe((a + 124) | 0);
    oe((a + 8) | 0);
    i = b;
    return;
  }
  function Ze(a) {
    a = a | 0;
    var b = 0;
    b = i;
    c[a >> 2] = 3032;
    pe((a + 156) | 0);
    pe((a + 124) | 0);
    oe((a + 8) | 0);
    Uq(a);
    i = b;
    return;
  }
  function _e(a) {
    a = a | 0;
    return 2;
  }
  function $e(d, e) {
    d = d | 0;
    e = e | 0;
    var f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0;
    f = i;
    j = c[(d + 4) >> 2] | 0;
    if (!(a[(d + 169) >> 0] | 0)) ge((d + 88) | 0);
    g = (d + 170) | 0;
    h = (d + 172) | 0;
    do
      if (a[h >> 0] | 0) {
        k = b[g >> 1] | 0;
        j = ((he((d + 88) | 0, j, c[(d + 124) >> 2] | 0) | 0) + k) | 0;
        d = c[(d + 112) >> 2] | 0;
        if ((j | 0) < 0) {
          j = (j + d) | 0;
          break;
        } else {
          j = (j - (j >>> 0 < d >>> 0 ? 0 : d)) | 0;
          break;
        }
      } else {
        d = c[j >> 2] | 0;
        l = (d + 8) | 0;
        m = c[l >> 2] | 0;
        k = (m + 1) | 0;
        c[l >> 2] = k;
        d = c[d >> 2] | 0;
        j = a[(d + m) >> 0] | 0;
        c[l >> 2] = m + 2;
        j = (a[(d + k) >> 0] << 8) | (j & 255);
      }
    while (0);
    d = j & 65535;
    if (a[h >> 0] | 0) {
      b[g >> 1] = d;
      l = (d & 65535) >>> 8;
      l = l & 255;
      m = (e + 1) | 0;
      a[m >> 0] = l;
      m = j & 255;
      a[e >> 0] = m;
      i = f;
      return;
    }
    a[h >> 0] = 1;
    b[g >> 1] = d;
    l = (d & 65535) >>> 8;
    l = l & 255;
    m = (e + 1) | 0;
    a[m >> 0] = l;
    m = j & 255;
    a[e >> 0] = m;
    i = f;
    return;
  }
  function af(a) {
    a = a | 0;
    return;
  }
  function bf(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function cf(a) {
    a = a | 0;
    var b = 0;
    b = i;
    a = c[(a + 12) >> 2] | 0;
    if (!a) {
      i = b;
      return;
    }
    jd[c[((c[a >> 2] | 0) + 4) >> 2] & 255](a);
    i = b;
    return;
  }
  function df(a, b) {
    a = a | 0;
    b = b | 0;
    if ((c[(b + 4) >> 2] | 0) == 3472) a = (a + 12) | 0;
    else a = 0;
    return a | 0;
  }
  function ef(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function ff(a) {
    a = a | 0;
    var b = 0;
    b = i;
    c[a >> 2] = 3640;
    pe((a + 156) | 0);
    pe((a + 124) | 0);
    oe((a + 8) | 0);
    i = b;
    return;
  }
  function gf(a) {
    a = a | 0;
    var b = 0;
    b = i;
    c[a >> 2] = 3640;
    pe((a + 156) | 0);
    pe((a + 124) | 0);
    oe((a + 8) | 0);
    Uq(a);
    i = b;
    return;
  }
  function hf(a) {
    a = a | 0;
    return 1;
  }
  function jf(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0;
    e = i;
    h = c[(b + 4) >> 2] | 0;
    if (!(a[(b + 169) >> 0] | 0)) ge((b + 88) | 0);
    g = (b + 170) | 0;
    f = (b + 171) | 0;
    if (a[f >> 0] | 0) {
      j = a[g >> 0] | 0;
      h = ((he((b + 88) | 0, h, c[(b + 124) >> 2] | 0) | 0) + j) | 0;
      b = c[(b + 112) >> 2] | 0;
      if ((h | 0) < 0) b = (h + b) | 0;
      else b = (h - (h >>> 0 < b >>> 0 ? 0 : b)) | 0;
      b = b & 255;
      if (a[f >> 0] | 0) {
        h = g;
        j = b;
        a[h >> 0] = j;
        a[d >> 0] = j;
        i = e;
        return;
      }
    } else {
      j = c[h >> 2] | 0;
      h = (j + 8) | 0;
      b = c[h >> 2] | 0;
      c[h >> 2] = b + 1;
      b = a[((c[j >> 2] | 0) + b) >> 0] | 0;
    }
    a[f >> 0] = 1;
    h = g;
    j = b;
    a[h >> 0] = j;
    a[d >> 0] = j;
    i = e;
    return;
  }
  function kf(a) {
    a = a | 0;
    return;
  }
  function lf(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function mf(a) {
    a = a | 0;
    var b = 0;
    b = i;
    a = c[(a + 12) >> 2] | 0;
    if (!a) {
      i = b;
      return;
    }
    jd[c[((c[a >> 2] | 0) + 4) >> 2] & 255](a);
    i = b;
    return;
  }
  function nf(a, b) {
    a = a | 0;
    b = b | 0;
    if ((c[(b + 4) >> 2] | 0) == 4080) a = (a + 12) | 0;
    else a = 0;
    return a | 0;
  }
  function of(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function pf(b, e) {
    b = b | 0;
    e = e | 0;
    var f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0;
    f = i;
    m = c[(b + 8) >> 2] | 0;
    g = c[(b + 12) >> 2] | 0;
    if ((m | 0) != (g | 0)) {
      k = 0;
      do {
        j = c[m >> 2] | 0;
        l = c[(m + 4) >> 2] | 0;
        h = (l | 0) == 0;
        if (!h) {
          n = (l + 4) | 0;
          c[n >> 2] = (c[n >> 2] | 0) + 1;
        }
        kd[c[((c[j >> 2] | 0) + 16) >> 2] & 63](j, (e + k) | 0);
        k = ((md[c[((c[j >> 2] | 0) + 8) >> 2] & 127](j) | 0) + k) | 0;
        if (
          (!h
          ? ((j = (l + 4) | 0), (n = c[j >> 2] | 0), (c[j >> 2] = n + -1), (n | 0) == 0)
          : 0)
            ? (jd[c[((c[l >> 2] | 0) + 8) >> 2] & 255](l),
              (j = (l + 8) | 0),
              (n = c[j >> 2] | 0),
              (c[j >> 2] = n + -1),
              (n | 0) == 0)
            : 0
        )
          jd[c[((c[l >> 2] | 0) + 16) >> 2] & 255](l);
        m = (m + 8) | 0;
      } while ((m | 0) != (g | 0));
    }
    g = (b + 20) | 0;
    if (!(a[g >> 0] | 0)) {
      i = f;
      return;
    }
    a[g >> 0] = 0;
    n = c[(b + 4) >> 2] | 0;
    m = c[n >> 2] | 0;
    k = (m + 8) | 0;
    j = c[k >> 2] | 0;
    c[k >> 2] = j + 1;
    j = d[((c[m >> 2] | 0) + j) >> 0] << 24;
    m = c[n >> 2] | 0;
    k = (m + 8) | 0;
    l = c[k >> 2] | 0;
    c[k >> 2] = l + 1;
    j = (d[((c[m >> 2] | 0) + l) >> 0] << 16) | j;
    l = c[n >> 2] | 0;
    m = (l + 8) | 0;
    k = c[m >> 2] | 0;
    c[m >> 2] = k + 1;
    k = j | (d[((c[l >> 2] | 0) + k) >> 0] << 8);
    l = c[n >> 2] | 0;
    j = (l + 8) | 0;
    m = c[j >> 2] | 0;
    c[j >> 2] = m + 1;
    c[(n + 4) >> 2] = k | d[((c[l >> 2] | 0) + m) >> 0];
    i = f;
    return;
  }
  function qf(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0,
      f = 0,
      g = 0,
      h = 0;
    b = i;
    c[a >> 2] = 4248;
    e = (a + 8) | 0;
    d = c[e >> 2] | 0;
    if (!d) {
      i = b;
      return;
    }
    a = (a + 12) | 0;
    g = c[a >> 2] | 0;
    if ((g | 0) != (d | 0)) {
      while (1) {
        f = (g + -8) | 0;
        c[a >> 2] = f;
        g = c[(g + -4) >> 2] | 0;
        if (g) {
          h = (g + 4) | 0;
          f = c[h >> 2] | 0;
          c[h >> 2] = f + -1;
          if (
            (f | 0) == 0
              ? (jd[c[((c[g >> 2] | 0) + 8) >> 2] & 255](g),
                (f = (g + 8) | 0),
                (h = c[f >> 2] | 0),
                (c[f >> 2] = h + -1),
                (h | 0) == 0)
              : 0
          )
            jd[c[((c[g >> 2] | 0) + 16) >> 2] & 255](g);
          f = c[a >> 2] | 0;
        }
        if ((f | 0) == (d | 0)) break;
        else g = f;
      }
      d = c[e >> 2] | 0;
    }
    Uq(d);
    i = b;
    return;
  }
  function rf(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0;
    b = i;
    c[a >> 2] = 4248;
    e = (a + 8) | 0;
    d = c[e >> 2] | 0;
    if (!d) {
      Uq(a);
      i = b;
      return;
    }
    f = (a + 12) | 0;
    h = c[f >> 2] | 0;
    if ((h | 0) != (d | 0)) {
      while (1) {
        g = (h + -8) | 0;
        c[f >> 2] = g;
        h = c[(h + -4) >> 2] | 0;
        if (h) {
          j = (h + 4) | 0;
          g = c[j >> 2] | 0;
          c[j >> 2] = g + -1;
          if (
            (g | 0) == 0
              ? (jd[c[((c[h >> 2] | 0) + 8) >> 2] & 255](h),
                (g = (h + 8) | 0),
                (j = c[g >> 2] | 0),
                (c[g >> 2] = j + -1),
                (j | 0) == 0)
              : 0
          )
            jd[c[((c[h >> 2] | 0) + 16) >> 2] & 255](h);
          g = c[f >> 2] | 0;
        }
        if ((g | 0) == (d | 0)) break;
        else h = g;
      }
      d = c[e >> 2] | 0;
    }
    Uq(d);
    Uq(a);
    i = b;
    return;
  }
  function sf(a) {
    a = a | 0;
    return;
  }
  function tf(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function uf(a) {
    a = a | 0;
    var b = 0;
    b = i;
    a = c[(a + 12) >> 2] | 0;
    if (!a) {
      i = b;
      return;
    }
    jd[c[((c[a >> 2] | 0) + 8) >> 2] & 255](a);
    i = b;
    return;
  }
  function vf(a, b) {
    a = a | 0;
    b = b | 0;
    if ((c[(b + 4) >> 2] | 0) == 4632) a = (a + 12) | 0;
    else a = 0;
    return a | 0;
  }
  function wf(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function xf(a) {
    a = a | 0;
    return;
  }
  function yf(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function zf(a) {
    a = a | 0;
    var b = 0;
    b = i;
    a = c[(a + 12) >> 2] | 0;
    if (a) Uq(a);
    i = b;
    return;
  }
  function Af(a, b) {
    a = a | 0;
    b = b | 0;
    if ((c[(b + 4) >> 2] | 0) == 4928) a = (a + 12) | 0;
    else a = 0;
    return a | 0;
  }
  function Bf(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function Cf(a) {
    a = a | 0;
    return;
  }
  function Df(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function Ef(a) {
    a = a | 0;
    var b = 0;
    b = i;
    a = c[(a + 12) >> 2] | 0;
    if (a) Uq(a);
    i = b;
    return;
  }
  function Ff(a, b) {
    a = a | 0;
    b = b | 0;
    if ((c[(b + 4) >> 2] | 0) == 5144) a = (a + 12) | 0;
    else a = 0;
    return a | 0;
  }
  function Gf(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function Hf(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0;
    b = i;
    c[a >> 2] = 27520;
    a = (a + 4) | 0;
    e = ((c[a >> 2] | 0) + -4) | 0;
    d = c[e >> 2] | 0;
    c[e >> 2] = d + -1;
    if (((d + -1) | 0) >= 0) {
      i = b;
      return;
    }
    Uq(((c[a >> 2] | 0) + -12) | 0);
    i = b;
    return;
  }
  function If(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0,
      f = 0;
    b = i;
    c[a >> 2] = 27520;
    d = (a + 4) | 0;
    f = ((c[d >> 2] | 0) + -4) | 0;
    e = c[f >> 2] | 0;
    c[f >> 2] = e + -1;
    if (((e + -1) | 0) >= 0) {
      Uq(a);
      i = b;
      return;
    }
    Uq(((c[d >> 2] | 0) + -12) | 0);
    Uq(a);
    i = b;
    return;
  }
  function Jf(a) {
    a = a | 0;
    var b = 0;
    b = i;
    pe((a + 4768) | 0);
    pe((a + 4736) | 0);
    pe((a + 4688) | 0);
    pe((a + 4656) | 0);
    pe((a + 4608) | 0);
    pe((a + 4576) | 0);
    pe((a + 4528) | 0);
    pe((a + 4496) | 0);
    pe((a + 4448) | 0);
    pe((a + 4416) | 0);
    oe((a + 4300) | 0);
    oe((a + 4220) | 0);
    oe((a + 4140) | 0);
    oe((a + 4060) | 0);
    oe((a + 3980) | 0);
    Kf(a);
    i = b;
    return;
  }
  function Kf(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0,
      f = 0;
    b = i;
    d = c[(a + 896) >> 2] | 0;
    if (d) {
      e = c[(d + 8) >> 2] | 0;
      if (e) Uq(c[(e + -4) >> 2] | 0);
      e = c[(d + 12) >> 2] | 0;
      if (e) Uq(c[(e + -4) >> 2] | 0);
      e = c[(d + 16) >> 2] | 0;
      if (e) Uq(c[(e + -4) >> 2] | 0);
      Uq(d);
    }
    d = c[(a + 900) >> 2] | 0;
    if (!d) d = 0;
    else {
      e = c[(d + 8) >> 2] | 0;
      if (e) Uq(c[(e + -4) >> 2] | 0);
      e = c[(d + 12) >> 2] | 0;
      if (e) Uq(c[(e + -4) >> 2] | 0);
      e = c[(d + 16) >> 2] | 0;
      if (e) Uq(c[(e + -4) >> 2] | 0);
      Uq(d);
      d = 0;
    }
    do {
      e = c[(a + (d << 2) + 904) >> 2] | 0;
      if (e) {
        f = c[(e + 8) >> 2] | 0;
        if (f) Uq(c[(f + -4) >> 2] | 0);
        f = c[(e + 12) >> 2] | 0;
        if (f) Uq(c[(f + -4) >> 2] | 0);
        f = c[(e + 16) >> 2] | 0;
        if (f) Uq(c[(f + -4) >> 2] | 0);
        Uq(e);
      }
      e = c[(a + (d << 2) + 1928) >> 2] | 0;
      if (e) {
        f = c[(e + 8) >> 2] | 0;
        if (f) Uq(c[(f + -4) >> 2] | 0);
        f = c[(e + 12) >> 2] | 0;
        if (f) Uq(c[(f + -4) >> 2] | 0);
        f = c[(e + 16) >> 2] | 0;
        if (f) Uq(c[(f + -4) >> 2] | 0);
        Uq(e);
      }
      e = c[(a + (d << 2) + 2952) >> 2] | 0;
      if (e) {
        f = c[(e + 8) >> 2] | 0;
        if (f) Uq(c[(f + -4) >> 2] | 0);
        f = c[(e + 12) >> 2] | 0;
        if (f) Uq(c[(f + -4) >> 2] | 0);
        f = c[(e + 16) >> 2] | 0;
        if (f) Uq(c[(f + -4) >> 2] | 0);
        Uq(e);
      }
      d = (d + 1) | 0;
    } while ((d | 0) != 256);
    d = c[(a + 860) >> 2] | 0;
    if (d) Uq(c[(d + -4) >> 2] | 0);
    d = c[(a + 864) >> 2] | 0;
    if (d) Uq(c[(d + -4) >> 2] | 0);
    a = c[(a + 868) >> 2] | 0;
    if (!a) {
      i = b;
      return;
    }
    Uq(c[(a + -4) >> 2] | 0);
    i = b;
    return;
  }
  function Lf(a) {
    a = a | 0;
    var b = 0,
      d = 0;
    b = i;
    d = c[(a + 56) >> 2] | 0;
    if (d) Uq(c[(d + -4) >> 2] | 0);
    d = c[(a + 60) >> 2] | 0;
    if (d) Uq(c[(d + -4) >> 2] | 0);
    d = c[(a + 64) >> 2] | 0;
    if (d) Uq(c[(d + -4) >> 2] | 0);
    d = c[(a + 12) >> 2] | 0;
    if (d) Uq(c[(d + -4) >> 2] | 0);
    d = c[(a + 16) >> 2] | 0;
    if (d) Uq(c[(d + -4) >> 2] | 0);
    a = c[(a + 20) >> 2] | 0;
    if (!a) {
      i = b;
      return;
    }
    Uq(c[(a + -4) >> 2] | 0);
    i = b;
    return;
  }
  function Mf(a) {
    a = a | 0;
    var b = 0,
      d = 0;
    b = i;
    d = c[(a + 280) >> 2] | 0;
    if (d) Uq(c[(d + -4) >> 2] | 0);
    d = c[(a + 284) >> 2] | 0;
    if (d) Uq(c[(d + -4) >> 2] | 0);
    d = c[(a + 288) >> 2] | 0;
    if (d) Uq(c[(d + -4) >> 2] | 0);
    d = c[(a + 236) >> 2] | 0;
    if (d) Uq(c[(d + -4) >> 2] | 0);
    d = c[(a + 240) >> 2] | 0;
    if (d) Uq(c[(d + -4) >> 2] | 0);
    d = c[(a + 244) >> 2] | 0;
    if (d) Uq(c[(d + -4) >> 2] | 0);
    d = c[(a + 192) >> 2] | 0;
    if (d) Uq(c[(d + -4) >> 2] | 0);
    d = c[(a + 196) >> 2] | 0;
    if (d) Uq(c[(d + -4) >> 2] | 0);
    d = c[(a + 200) >> 2] | 0;
    if (d) Uq(c[(d + -4) >> 2] | 0);
    d = c[(a + 148) >> 2] | 0;
    if (d) Uq(c[(d + -4) >> 2] | 0);
    d = c[(a + 152) >> 2] | 0;
    if (d) Uq(c[(d + -4) >> 2] | 0);
    d = c[(a + 156) >> 2] | 0;
    if (d) Uq(c[(d + -4) >> 2] | 0);
    d = c[(a + 104) >> 2] | 0;
    if (d) Uq(c[(d + -4) >> 2] | 0);
    d = c[(a + 108) >> 2] | 0;
    if (d) Uq(c[(d + -4) >> 2] | 0);
    d = c[(a + 112) >> 2] | 0;
    if (d) Uq(c[(d + -4) >> 2] | 0);
    d = c[(a + 60) >> 2] | 0;
    if (d) Uq(c[(d + -4) >> 2] | 0);
    d = c[(a + 64) >> 2] | 0;
    if (d) Uq(c[(d + -4) >> 2] | 0);
    d = c[(a + 68) >> 2] | 0;
    if (d) Uq(c[(d + -4) >> 2] | 0);
    d = c[(a + 16) >> 2] | 0;
    if (d) Uq(c[(d + -4) >> 2] | 0);
    d = c[(a + 20) >> 2] | 0;
    if (d) Uq(c[(d + -4) >> 2] | 0);
    a = c[(a + 24) >> 2] | 0;
    if (!a) {
      i = b;
      return;
    }
    Uq(c[(a + -4) >> 2] | 0);
    i = b;
    return;
  }
  function Nf(b) {
    b = b | 0;
    var c = 0,
      d = 0;
    c = i;
    d = (b + 8) | 0;
    a[(b + 0) >> 0] = 0;
    a[(b + 1) >> 0] = 0;
    a[(b + 2) >> 0] = 0;
    a[(b + 3) >> 0] = 0;
    a[(b + 4) >> 0] = 0;
    a[(b + 5) >> 0] = 0;
    a[(b + 6) >> 0] = 0;
    me(d, 128);
    me((b + 52) | 0, 256);
    me((b + 96) | 0, 256);
    me((b + 140) | 0, 256);
    me((b + 184) | 0, 256);
    me((b + 228) | 0, 256);
    me((b + 272) | 0, 256);
    i = c;
    return;
  }
  function Of(b) {
    b = b | 0;
    var d = 0,
      e = 0,
      f = 0,
      g = 0,
      h = 0;
    d = i;
    a[b >> 0] = 0;
    me((b + 4) | 0, 516);
    e = (b + 48) | 0;
    c[e >> 2] = 6;
    a[(b + 52) >> 0] = 0;
    c[(b + 80) >> 2] = 5;
    c[(b + 64) >> 2] = 0;
    c[(b + 88) >> 2] = 0;
    c[(b + 84) >> 2] = 0;
    g = Tq(92) | 0;
    f = (g + 68) & -64;
    c[(f + -4) >> 2] = g;
    c[(b + 56) >> 2] = f;
    f = Tq(92) | 0;
    g = (f + 68) & -64;
    c[(g + -4) >> 2] = f;
    c[(b + 60) >> 2] = g;
    c[(b + 68) >> 2] = 0;
    f = (b + 72) | 0;
    c[f >> 2] = 6;
    h = 0;
    do {
      c[(g + (h << 2)) >> 2] = 1;
      h = (h + 1) | 0;
    } while (h >>> 0 < (c[e >> 2] | 0) >>> 0);
    ke(e);
    e = (((c[e >> 2] | 0) + 6) | 0) >>> 1;
    c[f >> 2] = e;
    c[(b + 76) >> 2] = e;
    e = (b + 92) | 0;
    b = (e + 72) | 0;
    do {
      c[e >> 2] = 0;
      e = (e + 4) | 0;
    } while ((e | 0) < (b | 0));
    i = d;
    return;
  }
  function Pf(d) {
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0;
    e = i;
    f = (d + 52) | 0;
    g = (d + 72) | 0;
    c[(f + 0) >> 2] = 0;
    c[(f + 4) >> 2] = 0;
    c[(f + 8) >> 2] = 0;
    c[(f + 12) >> 2] = 0;
    c[(f + 16) >> 2] = 0;
    a[g >> 0] = 1;
    g = (d + 76) | 0;
    f = (d + 96) | 0;
    c[(g + 0) >> 2] = 0;
    c[(g + 4) >> 2] = 0;
    c[(g + 8) >> 2] = 0;
    c[(g + 12) >> 2] = 0;
    c[(g + 16) >> 2] = 0;
    a[f >> 0] = 1;
    f = (d + 100) | 0;
    g = (d + 120) | 0;
    c[(f + 0) >> 2] = 0;
    c[(f + 4) >> 2] = 0;
    c[(f + 8) >> 2] = 0;
    c[(f + 12) >> 2] = 0;
    c[(f + 16) >> 2] = 0;
    a[g >> 0] = 1;
    g = (d + 124) | 0;
    f = (d + 144) | 0;
    c[(g + 0) >> 2] = 0;
    c[(g + 4) >> 2] = 0;
    c[(g + 8) >> 2] = 0;
    c[(g + 12) >> 2] = 0;
    c[(g + 16) >> 2] = 0;
    a[f >> 0] = 1;
    f = (d + 148) | 0;
    g = (d + 168) | 0;
    c[(f + 0) >> 2] = 0;
    c[(f + 4) >> 2] = 0;
    c[(f + 8) >> 2] = 0;
    c[(f + 12) >> 2] = 0;
    c[(f + 16) >> 2] = 0;
    a[g >> 0] = 1;
    g = (d + 172) | 0;
    f = (d + 192) | 0;
    c[(g + 0) >> 2] = 0;
    c[(g + 4) >> 2] = 0;
    c[(g + 8) >> 2] = 0;
    c[(g + 12) >> 2] = 0;
    c[(g + 16) >> 2] = 0;
    a[f >> 0] = 1;
    f = (d + 196) | 0;
    g = (d + 216) | 0;
    c[(f + 0) >> 2] = 0;
    c[(f + 4) >> 2] = 0;
    c[(f + 8) >> 2] = 0;
    c[(f + 12) >> 2] = 0;
    c[(f + 16) >> 2] = 0;
    a[g >> 0] = 1;
    g = (d + 220) | 0;
    f = (d + 240) | 0;
    c[(g + 0) >> 2] = 0;
    c[(g + 4) >> 2] = 0;
    c[(g + 8) >> 2] = 0;
    c[(g + 12) >> 2] = 0;
    c[(g + 16) >> 2] = 0;
    a[f >> 0] = 1;
    f = (d + 244) | 0;
    g = (d + 264) | 0;
    c[(f + 0) >> 2] = 0;
    c[(f + 4) >> 2] = 0;
    c[(f + 8) >> 2] = 0;
    c[(f + 12) >> 2] = 0;
    c[(f + 16) >> 2] = 0;
    a[g >> 0] = 1;
    g = (d + 268) | 0;
    f = (d + 288) | 0;
    c[(g + 0) >> 2] = 0;
    c[(g + 4) >> 2] = 0;
    c[(g + 8) >> 2] = 0;
    c[(g + 12) >> 2] = 0;
    c[(g + 16) >> 2] = 0;
    a[f >> 0] = 1;
    f = (d + 292) | 0;
    g = (d + 312) | 0;
    c[(f + 0) >> 2] = 0;
    c[(f + 4) >> 2] = 0;
    c[(f + 8) >> 2] = 0;
    c[(f + 12) >> 2] = 0;
    c[(f + 16) >> 2] = 0;
    a[g >> 0] = 1;
    g = (d + 316) | 0;
    f = (d + 336) | 0;
    c[(g + 0) >> 2] = 0;
    c[(g + 4) >> 2] = 0;
    c[(g + 8) >> 2] = 0;
    c[(g + 12) >> 2] = 0;
    c[(g + 16) >> 2] = 0;
    a[f >> 0] = 1;
    f = (d + 340) | 0;
    g = (d + 360) | 0;
    c[(f + 0) >> 2] = 0;
    c[(f + 4) >> 2] = 0;
    c[(f + 8) >> 2] = 0;
    c[(f + 12) >> 2] = 0;
    c[(f + 16) >> 2] = 0;
    a[g >> 0] = 1;
    g = (d + 364) | 0;
    f = (d + 384) | 0;
    c[(g + 0) >> 2] = 0;
    c[(g + 4) >> 2] = 0;
    c[(g + 8) >> 2] = 0;
    c[(g + 12) >> 2] = 0;
    c[(g + 16) >> 2] = 0;
    a[f >> 0] = 1;
    f = (d + 388) | 0;
    g = (d + 408) | 0;
    c[(f + 0) >> 2] = 0;
    c[(f + 4) >> 2] = 0;
    c[(f + 8) >> 2] = 0;
    c[(f + 12) >> 2] = 0;
    c[(f + 16) >> 2] = 0;
    a[g >> 0] = 1;
    g = (d + 412) | 0;
    f = (d + 432) | 0;
    c[(g + 0) >> 2] = 0;
    c[(g + 4) >> 2] = 0;
    c[(g + 8) >> 2] = 0;
    c[(g + 12) >> 2] = 0;
    c[(g + 16) >> 2] = 0;
    a[f >> 0] = 1;
    f = (d + 436) | 0;
    g = (d + 456) | 0;
    c[(f + 0) >> 2] = 0;
    c[(f + 4) >> 2] = 0;
    c[(f + 8) >> 2] = 0;
    c[(f + 12) >> 2] = 0;
    c[(f + 16) >> 2] = 0;
    a[g >> 0] = 1;
    g = (d + 460) | 0;
    f = (d + 480) | 0;
    c[(g + 0) >> 2] = 0;
    c[(g + 4) >> 2] = 0;
    c[(g + 8) >> 2] = 0;
    c[(g + 12) >> 2] = 0;
    c[(g + 16) >> 2] = 0;
    a[f >> 0] = 1;
    f = (d + 484) | 0;
    g = (d + 504) | 0;
    c[(f + 0) >> 2] = 0;
    c[(f + 4) >> 2] = 0;
    c[(f + 8) >> 2] = 0;
    c[(f + 12) >> 2] = 0;
    c[(f + 16) >> 2] = 0;
    a[g >> 0] = 1;
    g = (d + 508) | 0;
    f = (d + 528) | 0;
    c[(g + 0) >> 2] = 0;
    c[(g + 4) >> 2] = 0;
    c[(g + 8) >> 2] = 0;
    c[(g + 12) >> 2] = 0;
    c[(g + 16) >> 2] = 0;
    a[f >> 0] = 1;
    f = (d + 532) | 0;
    g = (d + 552) | 0;
    c[(f + 0) >> 2] = 0;
    c[(f + 4) >> 2] = 0;
    c[(f + 8) >> 2] = 0;
    c[(f + 12) >> 2] = 0;
    c[(f + 16) >> 2] = 0;
    a[g >> 0] = 1;
    g = (d + 556) | 0;
    f = (d + 576) | 0;
    c[(g + 0) >> 2] = 0;
    c[(g + 4) >> 2] = 0;
    c[(g + 8) >> 2] = 0;
    c[(g + 12) >> 2] = 0;
    c[(g + 16) >> 2] = 0;
    a[f >> 0] = 1;
    f = (d + 580) | 0;
    g = (d + 600) | 0;
    c[(f + 0) >> 2] = 0;
    c[(f + 4) >> 2] = 0;
    c[(f + 8) >> 2] = 0;
    c[(f + 12) >> 2] = 0;
    c[(f + 16) >> 2] = 0;
    a[g >> 0] = 1;
    g = (d + 604) | 0;
    f = (d + 624) | 0;
    c[(g + 0) >> 2] = 0;
    c[(g + 4) >> 2] = 0;
    c[(g + 8) >> 2] = 0;
    c[(g + 12) >> 2] = 0;
    c[(g + 16) >> 2] = 0;
    a[f >> 0] = 1;
    f = (d + 628) | 0;
    g = (d + 648) | 0;
    c[(f + 0) >> 2] = 0;
    c[(f + 4) >> 2] = 0;
    c[(f + 8) >> 2] = 0;
    c[(f + 12) >> 2] = 0;
    c[(f + 16) >> 2] = 0;
    a[g >> 0] = 1;
    g = (d + 652) | 0;
    f = (d + 672) | 0;
    c[(g + 0) >> 2] = 0;
    c[(g + 4) >> 2] = 0;
    c[(g + 8) >> 2] = 0;
    c[(g + 12) >> 2] = 0;
    c[(g + 16) >> 2] = 0;
    a[f >> 0] = 1;
    f = (d + 676) | 0;
    g = (d + 696) | 0;
    c[(f + 0) >> 2] = 0;
    c[(f + 4) >> 2] = 0;
    c[(f + 8) >> 2] = 0;
    c[(f + 12) >> 2] = 0;
    c[(f + 16) >> 2] = 0;
    a[g >> 0] = 1;
    g = (d + 700) | 0;
    f = (d + 720) | 0;
    c[(g + 0) >> 2] = 0;
    c[(g + 4) >> 2] = 0;
    c[(g + 8) >> 2] = 0;
    c[(g + 12) >> 2] = 0;
    c[(g + 16) >> 2] = 0;
    a[f >> 0] = 1;
    f = (d + 724) | 0;
    g = (d + 744) | 0;
    c[(f + 0) >> 2] = 0;
    c[(f + 4) >> 2] = 0;
    c[(f + 8) >> 2] = 0;
    c[(f + 12) >> 2] = 0;
    c[(f + 16) >> 2] = 0;
    a[g >> 0] = 1;
    g = (d + 748) | 0;
    f = (d + 768) | 0;
    c[(g + 0) >> 2] = 0;
    c[(g + 4) >> 2] = 0;
    c[(g + 8) >> 2] = 0;
    c[(g + 12) >> 2] = 0;
    c[(g + 16) >> 2] = 0;
    a[f >> 0] = 1;
    f = (d + 772) | 0;
    g = (d + 792) | 0;
    c[(f + 0) >> 2] = 0;
    c[(f + 4) >> 2] = 0;
    c[(f + 8) >> 2] = 0;
    c[(f + 12) >> 2] = 0;
    c[(f + 16) >> 2] = 0;
    a[g >> 0] = 1;
    g = (d + 796) | 0;
    f = (d + 816) | 0;
    c[(g + 0) >> 2] = 0;
    c[(g + 4) >> 2] = 0;
    c[(g + 8) >> 2] = 0;
    c[(g + 12) >> 2] = 0;
    c[(g + 16) >> 2] = 0;
    a[f >> 0] = 1;
    me((d + 852) | 0, 64);
    a[(d + 3976) >> 0] = 0;
    f = (d + 20) | 0;
    g = (f + 32) | 0;
    do {
      b[f >> 1] = 0;
      f = (f + 2) | 0;
    } while ((f | 0) < (g | 0));
    f = Tq(44) | 0;
    a: do
      if (!f) {
        while (1) {
          f = c[6860] | 0;
          c[6860] = f + 0;
          if (!f) break;
          qd[f & 3]();
          f = Tq(44) | 0;
          if (f) break a;
        }
        g = Wb(4) | 0;
        c[g >> 2] = 27280;
        Zc(g | 0, 27328, 220);
      }
    while (0);
    me(f, 256);
    c[(d + 896) >> 2] = f;
    f = Tq(44) | 0;
    b: do
      if (!f) {
        while (1) {
          f = c[6860] | 0;
          c[6860] = f + 0;
          if (!f) break;
          qd[f & 3]();
          f = Tq(44) | 0;
          if (f) break b;
        }
        g = Wb(4) | 0;
        c[g >> 2] = 27280;
        Zc(g | 0, 27328, 220);
      }
    while (0);
    me(f, 256);
    c[(d + 900) >> 2] = f;
    f = (d + 820) | 0;
    c[(f + 0) >> 2] = 0;
    c[(f + 4) >> 2] = 0;
    c[(f + 8) >> 2] = 0;
    c[(f + 12) >> 2] = 0;
    c[(f + 16) >> 2] = 0;
    c[(f + 20) >> 2] = 0;
    c[(f + 24) >> 2] = 0;
    c[(f + 28) >> 2] = 0;
    f = 0;
    c: while (1) {
      g = Tq(44) | 0;
      if (!g)
        do {
          g = c[6860] | 0;
          c[6860] = g + 0;
          if (!g) {
            f = 20;
            break c;
          }
          qd[g & 3]();
          g = Tq(44) | 0;
        } while ((g | 0) == 0);
      me(g, 256);
      c[(d + (f << 2) + 904) >> 2] = g;
      g = Tq(44) | 0;
      if (!g)
        do {
          g = c[6860] | 0;
          c[6860] = g + 0;
          if (!g) {
            f = 27;
            break c;
          }
          qd[g & 3]();
          g = Tq(44) | 0;
        } while ((g | 0) == 0);
      me(g, 256);
      c[(d + (f << 2) + 1928) >> 2] = g;
      g = Tq(44) | 0;
      if (!g)
        do {
          g = c[6860] | 0;
          c[6860] = g + 0;
          if (!g) {
            f = 34;
            break c;
          }
          qd[g & 3]();
          g = Tq(44) | 0;
        } while ((g | 0) == 0);
      me(g, 256);
      c[(d + (f << 2) + 2952) >> 2] = g;
      f = (f + 1) | 0;
      if ((f | 0) >= 256) {
        f = 38;
        break;
      }
    }
    if ((f | 0) == 20) {
      g = Wb(4) | 0;
      c[g >> 2] = 27280;
      Zc(g | 0, 27328, 220);
    } else if ((f | 0) == 27) {
      g = Wb(4) | 0;
      c[g >> 2] = 27280;
      Zc(g | 0, 27328, 220);
    } else if ((f | 0) == 34) {
      g = Wb(4) | 0;
      c[g >> 2] = 27280;
      Zc(g | 0, 27328, 220);
    } else if ((f | 0) == 38) {
      c[(d + 3984) >> 2] = 16;
      c[(d + 3988) >> 2] = 4;
      c[(d + 3992) >> 2] = 8;
      c[(d + 3996) >> 2] = 0;
      c[(d + 4016) >> 2] = 0;
      c[(d + 4020) >> 2] = 0;
      c[(d + 4024) >> 2] = 0;
      c[(d + 4040) >> 2] = 1;
      c[(d + 4044) >> 2] = 2;
      c[(d + 4036) >> 2] = 4096;
      c[(d + 4032) >> 2] = 4;
      c[(d + 4028) >> 2] = 4;
      c[(d + 4048) >> 2] = 0;
      c[(d + 4052) >> 2] = 0;
      c[(d + 4056) >> 2] = 0;
      c[(d + 4e3) >> 2] = 16;
      c[(d + 4004) >> 2] = 65536;
      c[(d + 4008) >> 2] = -32768;
      c[(d + 4012) >> 2] = 32767;
      c[(d + 3980) >> 2] = 0;
      c[(d + 4064) >> 2] = 16;
      c[(d + 4068) >> 2] = 1;
      c[(d + 4072) >> 2] = 8;
      c[(d + 4076) >> 2] = 0;
      c[(d + 4096) >> 2] = 0;
      c[(d + 4100) >> 2] = 0;
      c[(d + 4104) >> 2] = 0;
      c[(d + 4120) >> 2] = 1;
      c[(d + 4124) >> 2] = 2;
      c[(d + 4116) >> 2] = 4096;
      c[(d + 4112) >> 2] = 4;
      c[(d + 4108) >> 2] = 4;
      c[(d + 4128) >> 2] = 0;
      c[(d + 4132) >> 2] = 0;
      c[(d + 4136) >> 2] = 0;
      c[(d + 4080) >> 2] = 16;
      c[(d + 4084) >> 2] = 65536;
      c[(d + 4088) >> 2] = -32768;
      c[(d + 4092) >> 2] = 32767;
      c[(d + 4060) >> 2] = 0;
      c[(d + 4144) >> 2] = 32;
      c[(d + 4148) >> 2] = 2;
      c[(d + 4152) >> 2] = 8;
      c[(d + 4156) >> 2] = 0;
      c[(d + 4176) >> 2] = 0;
      c[(d + 4180) >> 2] = 0;
      c[(d + 4184) >> 2] = 0;
      c[(d + 4200) >> 2] = 1;
      c[(d + 4204) >> 2] = 2;
      c[(d + 4196) >> 2] = 4096;
      c[(d + 4192) >> 2] = 4;
      c[(d + 4188) >> 2] = 4;
      c[(d + 4208) >> 2] = 0;
      c[(d + 4212) >> 2] = 0;
      c[(d + 4216) >> 2] = 0;
      c[(d + 4160) >> 2] = 32;
      c[(d + 4164) >> 2] = 0;
      c[(d + 4168) >> 2] = -2147483648;
      c[(d + 4172) >> 2] = 2147483647;
      c[(d + 4140) >> 2] = 0;
      c[(d + 4224) >> 2] = 32;
      c[(d + 4228) >> 2] = 22;
      c[(d + 4232) >> 2] = 8;
      c[(d + 4236) >> 2] = 0;
      c[(d + 4256) >> 2] = 0;
      c[(d + 4260) >> 2] = 0;
      c[(d + 4264) >> 2] = 0;
      c[(d + 4280) >> 2] = 1;
      c[(d + 4284) >> 2] = 2;
      c[(d + 4276) >> 2] = 4096;
      c[(d + 4272) >> 2] = 4;
      c[(d + 4268) >> 2] = 4;
      c[(d + 4288) >> 2] = 0;
      c[(d + 4292) >> 2] = 0;
      c[(d + 4296) >> 2] = 0;
      c[(d + 4240) >> 2] = 32;
      c[(d + 4244) >> 2] = 0;
      c[(d + 4248) >> 2] = -2147483648;
      c[(d + 4252) >> 2] = 2147483647;
      c[(d + 4220) >> 2] = 0;
      c[(d + 4304) >> 2] = 32;
      c[(d + 4308) >> 2] = 20;
      c[(d + 4312) >> 2] = 8;
      c[(d + 4316) >> 2] = 0;
      c[(d + 4336) >> 2] = 0;
      c[(d + 4340) >> 2] = 0;
      c[(d + 4344) >> 2] = 0;
      c[(d + 4360) >> 2] = 1;
      c[(d + 4364) >> 2] = 2;
      c[(d + 4356) >> 2] = 4096;
      c[(d + 4352) >> 2] = 4;
      c[(d + 4348) >> 2] = 4;
      c[(d + 4368) >> 2] = 0;
      c[(d + 4372) >> 2] = 0;
      c[(d + 4376) >> 2] = 0;
      c[(d + 4320) >> 2] = 32;
      c[(d + 4324) >> 2] = 0;
      c[(d + 4328) >> 2] = -2147483648;
      c[(d + 4332) >> 2] = 2147483647;
      c[(d + 4300) >> 2] = 0;
      c[(d + 4384) >> 2] = 16;
      c[(d + 4388) >> 2] = 4;
      c[(d + 4392) >> 2] = 8;
      c[(d + 4396) >> 2] = 0;
      c[(d + 4416) >> 2] = 0;
      c[(d + 4420) >> 2] = 0;
      c[(d + 4424) >> 2] = 0;
      c[(d + 4440) >> 2] = 1;
      c[(d + 4444) >> 2] = 2;
      c[(d + 4436) >> 2] = 4096;
      c[(d + 4432) >> 2] = 4;
      c[(d + 4428) >> 2] = 4;
      c[(d + 4448) >> 2] = 0;
      c[(d + 4452) >> 2] = 0;
      c[(d + 4456) >> 2] = 0;
      c[(d + 4400) >> 2] = 16;
      c[(d + 4404) >> 2] = 65536;
      c[(d + 4408) >> 2] = -32768;
      c[(d + 4412) >> 2] = 32767;
      c[(d + 4380) >> 2] = 0;
      c[(d + 4464) >> 2] = 16;
      c[(d + 4468) >> 2] = 1;
      c[(d + 4472) >> 2] = 8;
      c[(d + 4476) >> 2] = 0;
      c[(d + 4496) >> 2] = 0;
      c[(d + 4500) >> 2] = 0;
      c[(d + 4504) >> 2] = 0;
      c[(d + 4520) >> 2] = 1;
      c[(d + 4524) >> 2] = 2;
      c[(d + 4516) >> 2] = 4096;
      c[(d + 4512) >> 2] = 4;
      c[(d + 4508) >> 2] = 4;
      c[(d + 4528) >> 2] = 0;
      c[(d + 4532) >> 2] = 0;
      c[(d + 4536) >> 2] = 0;
      c[(d + 4480) >> 2] = 16;
      c[(d + 4484) >> 2] = 65536;
      c[(d + 4488) >> 2] = -32768;
      c[(d + 4492) >> 2] = 32767;
      c[(d + 4460) >> 2] = 0;
      c[(d + 4544) >> 2] = 32;
      c[(d + 4548) >> 2] = 2;
      c[(d + 4552) >> 2] = 8;
      c[(d + 4556) >> 2] = 0;
      c[(d + 4576) >> 2] = 0;
      c[(d + 4580) >> 2] = 0;
      c[(d + 4584) >> 2] = 0;
      c[(d + 4600) >> 2] = 1;
      c[(d + 4604) >> 2] = 2;
      c[(d + 4596) >> 2] = 4096;
      c[(d + 4592) >> 2] = 4;
      c[(d + 4588) >> 2] = 4;
      c[(d + 4608) >> 2] = 0;
      c[(d + 4612) >> 2] = 0;
      c[(d + 4616) >> 2] = 0;
      c[(d + 4560) >> 2] = 32;
      c[(d + 4564) >> 2] = 0;
      c[(d + 4568) >> 2] = -2147483648;
      c[(d + 4572) >> 2] = 2147483647;
      c[(d + 4540) >> 2] = 0;
      c[(d + 4624) >> 2] = 32;
      c[(d + 4628) >> 2] = 22;
      c[(d + 4632) >> 2] = 8;
      c[(d + 4636) >> 2] = 0;
      c[(d + 4656) >> 2] = 0;
      c[(d + 4660) >> 2] = 0;
      c[(d + 4664) >> 2] = 0;
      c[(d + 4680) >> 2] = 1;
      c[(d + 4684) >> 2] = 2;
      c[(d + 4676) >> 2] = 4096;
      c[(d + 4672) >> 2] = 4;
      c[(d + 4668) >> 2] = 4;
      c[(d + 4688) >> 2] = 0;
      c[(d + 4692) >> 2] = 0;
      c[(d + 4696) >> 2] = 0;
      c[(d + 4640) >> 2] = 32;
      c[(d + 4644) >> 2] = 0;
      c[(d + 4648) >> 2] = -2147483648;
      c[(d + 4652) >> 2] = 2147483647;
      c[(d + 4620) >> 2] = 0;
      c[(d + 4704) >> 2] = 32;
      c[(d + 4708) >> 2] = 20;
      c[(d + 4712) >> 2] = 8;
      c[(d + 4716) >> 2] = 0;
      c[(d + 4736) >> 2] = 0;
      c[(d + 4740) >> 2] = 0;
      c[(d + 4744) >> 2] = 0;
      c[(d + 4760) >> 2] = 1;
      c[(d + 4764) >> 2] = 2;
      c[(d + 4756) >> 2] = 4096;
      c[(d + 4752) >> 2] = 4;
      c[(d + 4748) >> 2] = 4;
      c[(d + 4768) >> 2] = 0;
      c[(d + 4772) >> 2] = 0;
      c[(d + 4776) >> 2] = 0;
      c[(d + 4720) >> 2] = 32;
      c[(d + 4724) >> 2] = 0;
      c[(d + 4728) >> 2] = -2147483648;
      c[(d + 4732) >> 2] = 2147483647;
      c[(d + 4700) >> 2] = 0;
      a[(d + 4780) >> 0] = 0;
      a[(d + 4781) >> 0] = 0;
      i = e;
      return;
    }
  }
  function Qf(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0;
    e = i;
    i = (i + 32) | 0;
    h = e;
    f = c[(b + 8) >> 2] | 0;
    b = c[(b + 4) >> 2] | 0;
    Tf(h, f, b);
    g = c[h >> 2] | 0;
    a[(d + 3) >> 0] = g >>> 24;
    a[(d + 2) >> 0] = g >>> 16;
    a[(d + 1) >> 0] = g >>> 8;
    a[d >> 0] = g;
    g = c[(h + 4) >> 2] | 0;
    a[(d + 7) >> 0] = g >>> 24;
    a[(d + 6) >> 0] = g >>> 16;
    a[(d + 5) >> 0] = g >>> 8;
    a[(d + 4) >> 0] = g;
    g = c[(h + 8) >> 2] | 0;
    a[(d + 11) >> 0] = g >>> 24;
    a[(d + 10) >> 0] = g >>> 16;
    a[(d + 9) >> 0] = g >>> 8;
    a[(d + 8) >> 0] = g;
    g = c[(h + 12) >> 2] | 0;
    a[(d + 13) >> 0] = (g & 65535) >>> 8;
    a[(d + 12) >> 0] = g;
    a[(d + 14) >> 0] = g >>> 16;
    a[(d + 15) >> 0] = g >>> 24;
    h = c[(h + 16) >> 2] | 0;
    a[(d + 16) >> 0] = h;
    a[(d + 17) >> 0] = (h & 65535) >>> 8;
    a[(d + 19) >> 0] = h >>> 24;
    a[(d + 18) >> 0] = h >>> 16;
    h = Uf((f + 4784) | 0, b) | 0;
    g = H;
    a[(d + 23) >> 0] = h >>> 24;
    a[(d + 22) >> 0] = h >>> 16;
    a[(d + 21) >> 0] = h >>> 8;
    a[(d + 20) >> 0] = h;
    j = lr(h | 0, g | 0, 56) | 0;
    a[(d + 27) >> 0] = j;
    j = lr(h | 0, g | 0, 48) | 0;
    a[(d + 26) >> 0] = j;
    h = lr(h | 0, g | 0, 40) | 0;
    a[(d + 25) >> 0] = h;
    a[(d + 24) >> 0] = g;
    Vf((f + 5112) | 0, b, (d + 28) | 0);
    i = e;
    return;
  }
  function Rf(a) {
    a = a | 0;
    var b = 0;
    b = i;
    c[a >> 2] = 5368;
    a = c[(a + 8) >> 2] | 0;
    if (!a) {
      i = b;
      return;
    }
    Mf((a + 5112) | 0);
    pe((a + 5096) | 0);
    pe((a + 5064) | 0);
    oe((a + 4948) | 0);
    Lf((a + 4784) | 0);
    Jf(a);
    Uq(a);
    i = b;
    return;
  }
  function Sf(a) {
    a = a | 0;
    var b = 0,
      d = 0;
    b = i;
    c[a >> 2] = 5368;
    d = c[(a + 8) >> 2] | 0;
    if (!d) {
      Uq(a);
      i = b;
      return;
    }
    Mf((d + 5112) | 0);
    pe((d + 5096) | 0);
    pe((d + 5064) | 0);
    oe((d + 4948) | 0);
    Lf((d + 4784) | 0);
    Jf(d);
    Uq(d);
    Uq(a);
    i = b;
    return;
  }
  function Tf(f, g, h) {
    f = f | 0;
    g = g | 0;
    h = h | 0;
    var j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0,
      v = 0;
    j = i;
    i = (i + 32) | 0;
    k = j;
    l = (g + 4781) | 0;
    if (!(a[l >> 0] | 0)) {
      ge((g + 4380) | 0);
      ge((g + 4460) | 0);
      ge((g + 4540) | 0);
      ge((g + 4620) | 0);
      ge((g + 4700) | 0);
      a[l >> 0] = 1;
    }
    l = (g + 3976) | 0;
    if (!(a[l >> 0] | 0)) {
      a[l >> 0] = 1;
      Zf(c[h >> 2] | 0, k, 20);
      r = (d[(k + 1) >> 0] << 8) | d[k >> 0] | (d[(k + 2) >> 0] << 16) | (d[(k + 3) >> 0] << 24);
      o =
        (d[(k + 5) >> 0] << 8) |
        d[(k + 4) >> 0] |
        (d[(k + 6) >> 0] << 16) |
        (d[(k + 7) >> 0] << 24);
      p =
        (d[(k + 9) >> 0] << 8) |
        d[(k + 8) >> 0] |
        (d[(k + 10) >> 0] << 16) |
        (d[(k + 11) >> 0] << 24);
      q = ((a[(k + 13) >> 0] << 8) | d[(k + 12) >> 0]) & 65535;
      s = a[(k + 14) >> 0] | 0;
      t = a[(k + 15) >> 0] | 0;
      u = a[(k + 16) >> 0] | 0;
      h = a[(k + 17) >> 0] | 0;
      v = ((a[(k + 19) >> 0] << 8) | d[(k + 18) >> 0]) & 65535;
      a[g >> 0] = r;
      a[(g + 1) >> 0] = r >> 8;
      a[(g + 2) >> 0] = r >> 16;
      a[(g + 3) >> 0] = r >> 24;
      r = (g + 4) | 0;
      a[r >> 0] = o;
      a[(r + 1) >> 0] = o >> 8;
      a[(r + 2) >> 0] = o >> 16;
      a[(r + 3) >> 0] = o >> 24;
      r = (g + 8) | 0;
      a[r >> 0] = p;
      a[(r + 1) >> 0] = p >> 8;
      a[(r + 2) >> 0] = p >> 16;
      a[(r + 3) >> 0] = p >> 24;
      r = (g + 12) | 0;
      a[r >> 0] = q;
      a[(r + 1) >> 0] = q >> 8;
      a[(g + 14) >> 0] = s;
      a[(g + 15) >> 0] = t;
      a[(g + 16) >> 0] = u;
      a[(g + 17) >> 0] = h;
      h = (g + 18) | 0;
      a[h >> 0] = v;
      a[(h + 1) >> 0] = v >> 8;
      f = (f + 0) | 0;
      h = (g + 0) | 0;
      g = (f + 20) | 0;
      do {
        a[f >> 0] = a[h >> 0] | 0;
        f = (f + 1) | 0;
        h = (h + 1) | 0;
      } while ((f | 0) < (g | 0));
      i = j;
      return;
    }
    m = _f(h, (g + 852) | 0) | 0;
    if (m) {
      o = (g + 14) | 0;
      k = a[o >> 0] | 0;
      if (m & 32) {
        k =
          (_f(
            h,
            c[
              (g +
                ((((((k & 255) >>> 7) & 255) << 7) |
                  (k & 7) |
                  (((((k & 255) >>> 6) & 255) << 6) & 64) |
                  (((((k & 255) >>> 3) & 255) << 3) & 56)) <<
                  2) +
                904) >>
                2
            ] | 0
          ) |
            0) &
          255;
        a[o >> 0] = k;
      }
      l = k & 7;
      k = ((k & 255) >>> 3) & 7;
      n = d[(5768 + (k << 3) + l) >> 0] | 0;
      l = d[(5832 + (k << 3) + l) >> 0] | 0;
      if (!(m & 16)) {
        u = b[(g + (n << 1) + 20) >> 1] | 0;
        v = (g + 12) | 0;
        a[v >> 0] = u;
        a[(v + 1) >> 0] = u >> 8;
      } else {
        p = (g + (n << 1) + 20) | 0;
        q = e[p >> 1] | 0;
        q =
          (($f(
            (g + 4380) | 0,
            h,
            ((c[(g + 4416) >> 2] | 0) + (((n >>> 0 < 3 ? n : 3) * 44) | 0)) | 0
          ) |
            0) +
            q) |
          0;
        r = c[(g + 4404) >> 2] | 0;
        if ((q | 0) < 0) q = (q + r) | 0;
        else q = (q - (q >>> 0 < r >>> 0 ? 0 : r)) | 0;
        v = q & 65535;
        u = (g + 12) | 0;
        a[u >> 0] = v;
        a[(u + 1) >> 0] = v >> 8;
        b[p >> 1] = v;
      }
      if (m & 8) {
        v = (g + 15) | 0;
        a[v >> 0] = _f(h, c[(g + (d[v >> 0] << 2) + 1928) >> 2] | 0) | 0;
      }
      if (m & 4) {
        p = _f(h, c[(g + ((((d[o >> 0] | 0) >>> 6) & 1) << 2) + 896) >> 2] | 0) | 0;
        o = (g + 16) | 0;
        p = ((a[o >> 0] | 0) + p) | 0;
        if ((p | 0) < 0) p = (p + 256) | 0;
        else p = (p | 0) > 255 ? (p + -256) | 0 : p;
        a[o >> 0] = p;
      }
      if (m & 2) {
        v = (g + 17) | 0;
        a[v >> 0] = _f(h, c[(g + (d[v >> 0] << 2) + 2952) >> 2] | 0) | 0;
      }
      if (m & 1) {
        m = (g + 18) | 0;
        p = (d[m >> 0] | (d[(m + 1) >> 0] << 8)) & 65535;
        p = (($f((g + 4460) | 0, h, c[(g + 4496) >> 2] | 0) | 0) + p) | 0;
        o = c[(g + 4484) >> 2] | 0;
        if ((p | 0) < 0) o = (p + o) | 0;
        else o = (p - (p >>> 0 < o >>> 0 ? 0 : o)) | 0;
        v = o & 65535;
        a[m >> 0] = v;
        a[(m + 1) >> 0] = v >> 8;
      }
    } else {
      k = a[(g + 14) >> 0] | 0;
      n = k & 7;
      k = ((k & 255) >>> 3) & 7;
      l = d[(5832 + (k << 3) + n) >> 0] | 0;
      n = d[(5768 + (k << 3) + n) >> 0] | 0;
    }
    q = (g + ((n * 24) | 0) + 52) | 0;
    o = (g + ((n * 24) | 0) + 60) | 0;
    p = c[o >> 2] | 0;
    m = (g + 4540) | 0;
    k = ((k | 0) == 1) & 1;
    p = (($f(m, h, ((c[(g + 4576) >> 2] | 0) + ((k * 44) | 0)) | 0) | 0) + p) | 0;
    r = c[(g + 4564) >> 2] | 0;
    if ((p | 0) < 0) p = (p + r) | 0;
    else p = (p - (p >>> 0 < r >>> 0 ? 0 : r)) | 0;
    r =
      ((d[g >> 0] | (d[(g + 1) >> 0] << 8) | (d[(g + 2) >> 0] << 16) | (d[(g + 3) >> 0] << 24)) +
        p) |
      0;
    a[g >> 0] = r;
    a[(g + 1) >> 0] = r >> 8;
    a[(g + 2) >> 0] = r >> 16;
    a[(g + 3) >> 0] = r >> 24;
    r = (g + ((n * 24) | 0) + 72) | 0;
    s = c[o >> 2] | 0;
    do
      if (!(a[r >> 0] | 0)) {
        u = (g + ((n * 24) | 0) + 56) | 0;
        t = c[u >> 2] | 0;
        if ((s | 0) >= (p | 0)) {
          if ((t | 0) < (p | 0)) {
            c[q >> 2] = t;
            c[u >> 2] = p;
          } else c[q >> 2] = p;
          a[r >> 0] = 1;
          break;
        }
        c[q >> 2] = t;
        c[u >> 2] = s;
        t = (g + ((n * 24) | 0) + 68) | 0;
        q = c[t >> 2] | 0;
        s = (g + ((n * 24) | 0) + 64) | 0;
        r = c[s >> 2] | 0;
        if ((q | 0) < (p | 0)) {
          c[o >> 2] = r;
          c[s >> 2] = q;
          c[t >> 2] = p;
          break;
        }
        if ((r | 0) < (p | 0)) {
          c[o >> 2] = r;
          c[s >> 2] = p;
          break;
        } else {
          c[o >> 2] = p;
          break;
        }
      } else {
        t = (g + ((n * 24) | 0) + 64) | 0;
        u = c[t >> 2] | 0;
        if ((p | 0) >= (s | 0)) {
          o = (g + ((n * 24) | 0) + 68) | 0;
          if ((p | 0) < (u | 0)) {
            c[o >> 2] = u;
            c[t >> 2] = p;
          } else c[o >> 2] = p;
          a[r >> 0] = 0;
          break;
        }
        c[(g + ((n * 24) | 0) + 68) >> 2] = u;
        c[t >> 2] = s;
        s = c[q >> 2] | 0;
        t = (g + ((n * 24) | 0) + 56) | 0;
        r = c[t >> 2] | 0;
        if ((p | 0) < (s | 0)) {
          c[o >> 2] = r;
          c[t >> 2] = s;
          c[q >> 2] = p;
          break;
        }
        if ((p | 0) < (r | 0)) {
          c[o >> 2] = r;
          c[t >> 2] = p;
          break;
        } else {
          c[o >> 2] = p;
          break;
        }
      }
    while (0);
    r = (g + ((n * 24) | 0) + 436) | 0;
    p = (g + ((n * 24) | 0) + 444) | 0;
    q = c[p >> 2] | 0;
    s = c[m >> 2] | 0;
    o = (g + 4620) | 0;
    q =
      (($f(o, h, ((c[(g + 4656) >> 2] | 0) + ((((s >>> 0 < 20 ? s & -2 : 20) | k) * 44) | 0)) | 0) |
        0) +
        q) |
      0;
    s = c[(g + 4644) >> 2] | 0;
    if ((q | 0) < 0) q = (q + s) | 0;
    else q = (q - (q >>> 0 < s >>> 0 ? 0 : s)) | 0;
    s = (g + 4) | 0;
    t =
      ((d[s >> 0] | (d[(s + 1) >> 0] << 8) | (d[(s + 2) >> 0] << 16) | (d[(s + 3) >> 0] << 24)) +
        q) |
      0;
    a[s >> 0] = t;
    a[(s + 1) >> 0] = t >> 8;
    a[(s + 2) >> 0] = t >> 16;
    a[(s + 3) >> 0] = t >> 24;
    s = (g + ((n * 24) | 0) + 456) | 0;
    t = c[p >> 2] | 0;
    do
      if (!(a[s >> 0] | 0)) {
        u = (g + ((n * 24) | 0) + 440) | 0;
        v = c[u >> 2] | 0;
        if ((t | 0) >= (q | 0)) {
          if ((v | 0) < (q | 0)) {
            c[r >> 2] = v;
            c[u >> 2] = q;
          } else c[r >> 2] = q;
          a[s >> 0] = 1;
          break;
        }
        c[r >> 2] = v;
        c[u >> 2] = t;
        s = (g + ((n * 24) | 0) + 452) | 0;
        r = c[s >> 2] | 0;
        n = (g + ((n * 24) | 0) + 448) | 0;
        t = c[n >> 2] | 0;
        if ((r | 0) < (q | 0)) {
          c[p >> 2] = t;
          c[n >> 2] = r;
          c[s >> 2] = q;
          break;
        }
        if ((t | 0) < (q | 0)) {
          c[p >> 2] = t;
          c[n >> 2] = q;
          break;
        } else {
          c[p >> 2] = q;
          break;
        }
      } else {
        u = (g + ((n * 24) | 0) + 448) | 0;
        v = c[u >> 2] | 0;
        if ((q | 0) >= (t | 0)) {
          n = (g + ((n * 24) | 0) + 452) | 0;
          if ((q | 0) < (v | 0)) {
            c[n >> 2] = v;
            c[u >> 2] = q;
          } else c[n >> 2] = q;
          a[s >> 0] = 0;
          break;
        }
        c[(g + ((n * 24) | 0) + 452) >> 2] = v;
        c[u >> 2] = t;
        s = c[r >> 2] | 0;
        n = (g + ((n * 24) | 0) + 440) | 0;
        t = c[n >> 2] | 0;
        if ((q | 0) < (s | 0)) {
          c[p >> 2] = t;
          c[n >> 2] = s;
          c[r >> 2] = q;
          break;
        }
        if ((q | 0) < (t | 0)) {
          c[p >> 2] = t;
          c[n >> 2] = q;
          break;
        } else {
          c[p >> 2] = q;
          break;
        }
      }
    while (0);
    m = ((c[o >> 2] | 0) + (c[m >> 2] | 0)) | 0;
    l = (g + (l << 2) + 820) | 0;
    n = c[l >> 2] | 0;
    if (m >>> 0 < 36) m = (m >>> 1) & 2147483646;
    else m = 18;
    k =
      (($f((g + 4700) | 0, h, ((c[(g + 4736) >> 2] | 0) + (((m | k) * 44) | 0)) | 0) | 0) + n) | 0;
    h = c[(g + 4724) >> 2] | 0;
    if ((k | 0) < 0) h = (k + h) | 0;
    else h = (k - (k >>> 0 < h >>> 0 ? 0 : h)) | 0;
    v = (g + 8) | 0;
    a[v >> 0] = h;
    a[(v + 1) >> 0] = h >> 8;
    a[(v + 2) >> 0] = h >> 16;
    a[(v + 3) >> 0] = h >> 24;
    c[l >> 2] = h;
    f = (f + 0) | 0;
    h = (g + 0) | 0;
    g = (f + 20) | 0;
    do {
      a[f >> 0] = a[h >> 0] | 0;
      f = (f + 1) | 0;
      h = (h + 1) | 0;
    } while ((f | 0) < (g | 0));
    i = j;
    return;
  }
  function Uf(b, e) {
    b = b | 0;
    e = e | 0;
    var f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0;
    f = i;
    i = (i + 16) | 0;
    g = f;
    h = (b + 325) | 0;
    if (!(a[h >> 0] | 0)) {
      ge((b + 244) | 0);
      a[h >> 0] = 1;
    }
    if (!(a[b >> 0] | 0)) {
      a[b >> 0] = 1;
      Zf(c[e >> 2] | 0, g, 8);
      n = (d[(g + 1) >> 0] << 8) | d[g >> 0] | (d[(g + 2) >> 0] << 16) | (d[(g + 3) >> 0] << 24);
      m =
        (d[(g + 5) >> 0] << 8) |
        d[(g + 4) >> 0] |
        (d[(g + 6) >> 0] << 16) |
        (d[(g + 7) >> 0] << 24);
      l = (b + 100) | 0;
      k = l;
      a[k >> 0] = n;
      a[(k + 1) >> 0] = n >> 8;
      a[(k + 2) >> 0] = n >> 16;
      a[(k + 3) >> 0] = n >> 24;
      l = (l + 4) | 0;
      a[l >> 0] = m;
      a[(l + 1) >> 0] = m >> 8;
      a[(l + 2) >> 0] = m >> 16;
      a[(l + 3) >> 0] = m >> 24;
      H = m;
      i = f;
      return n | 0;
    }
    g = (b + 92) | 0;
    do
      if (!(c[(b + (c[g >> 2] << 2) + 132) >> 2] | 0)) {
        h = _f(e, (b + 48) | 0) | 0;
        if ((h | 0) == 2) {
          h = (b + 96) | 0;
          c[h >> 2] = ((c[h >> 2] | 0) + 1) & 3;
          j = (b + (c[g >> 2] << 3) + 104) | 0;
          j =
            d[j >> 0] | (d[(j + 1) >> 0] << 8) | (d[(j + 2) >> 0] << 16) | (d[(j + 3) >> 0] << 24);
          j = (($f((b + 244) | 0, e, ((c[(b + 280) >> 2] | 0) + 352) | 0) | 0) + j) | 0;
          k = c[(b + 268) >> 2] | 0;
          if ((j | 0) < 0) j = (j + k) | 0;
          else j = (j - (j >>> 0 < k >>> 0 ? 0 : k)) | 0;
          m = (((j | 0) < 0) << 31) >> 31;
          k = (b + (c[h >> 2] << 3) + 100) | 0;
          n = k;
          a[n >> 0] = j;
          a[(n + 1) >> 0] = j >> 8;
          a[(n + 2) >> 0] = j >> 16;
          a[(n + 3) >> 0] = j >> 24;
          k = (k + 4) | 0;
          a[k >> 0] = m;
          a[(k + 1) >> 0] = m >> 8;
          a[(k + 2) >> 0] = m >> 16;
          a[(k + 3) >> 0] = m >> 24;
          k = (b + (c[h >> 2] << 3) + 100) | 0;
          m = k;
          m =
            d[m >> 0] | (d[(m + 1) >> 0] << 8) | (d[(m + 2) >> 0] << 16) | (d[(m + 3) >> 0] << 24);
          j = k;
          a[j >> 0] = 0;
          a[(j + 1) >> 0] = 0;
          a[(j + 2) >> 0] = 0;
          a[(j + 3) >> 0] = 0;
          k = (k + 4) | 0;
          a[k >> 0] = m;
          a[(k + 1) >> 0] = m >> 8;
          a[(k + 2) >> 0] = m >> 16;
          a[(k + 3) >> 0] = m >> 24;
          k = (e + 4) | 0;
          m = c[k >> 2] | 0;
          j = (e + 8) | 0;
          n = (c[j >> 2] | 0) >>> 16;
          c[j >> 2] = n;
          l = ((m >>> 0) / (n >>> 0)) | 0;
          n = (m - (da(n, l) | 0)) | 0;
          c[k >> 2] = n;
          do {
            n = ((Wf(c[e >> 2] | 0) | 0) & 255) | (n << 8);
            c[k >> 2] = n;
            m = c[j >> 2] | 0;
            o = m << 8;
            c[j >> 2] = o;
          } while (o >>> 0 < 16777216);
          o = (m >>> 8) & 65535;
          c[j >> 2] = o;
          m = ((n >>> 0) / (o >>> 0)) | 0;
          n = (n - (da(m, o) | 0)) | 0;
          c[k >> 2] = n;
          do {
            n = ((Wf(c[e >> 2] | 0) | 0) & 255) | (n << 8);
            c[k >> 2] = n;
            o = c[j >> 2] << 8;
            c[j >> 2] = o;
          } while (o >>> 0 < 16777216);
          o = (b + (c[h >> 2] << 3) + 100) | 0;
          n = o;
          k = n;
          n = (n + 4) | 0;
          n =
            d[n >> 0] | (d[(n + 1) >> 0] << 8) | (d[(n + 2) >> 0] << 16) | (d[(n + 3) >> 0] << 24);
          l =
            d[k >> 0] |
            (d[(k + 1) >> 0] << 8) |
            (d[(k + 2) >> 0] << 16) |
            (d[(k + 3) >> 0] << 24) |
            ((m << 16) | (l & 65535));
          m = o;
          a[m >> 0] = l;
          a[(m + 1) >> 0] = l >> 8;
          a[(m + 2) >> 0] = l >> 16;
          a[(m + 3) >> 0] = l >> 24;
          o = (o + 4) | 0;
          a[o >> 0] = n;
          a[(o + 1) >> 0] = n >> 8;
          a[(o + 2) >> 0] = n >> 16;
          a[(o + 3) >> 0] = n >> 24;
          o = c[h >> 2] | 0;
          c[g >> 2] = o;
          c[(b + (o << 2) + 132) >> 2] = 0;
          c[(b + (c[g >> 2] << 2) + 148) >> 2] = 0;
          break;
        } else if ((h | 0) == 1) {
          e = $f((b + 244) | 0, e, c[(b + 280) >> 2] | 0) | 0;
          h = c[(b + 268) >> 2] | 0;
          if ((e | 0) < 0) e = (h + e) | 0;
          else e = (e - (e >>> 0 < h >>> 0 ? 0 : h)) | 0;
          c[(b + (c[g >> 2] << 2) + 132) >> 2] = e;
          o = c[g >> 2] | 0;
          l = c[(b + (o << 2) + 132) >> 2] | 0;
          o = (b + (o << 3) + 100) | 0;
          n = o;
          m = n;
          n = (n + 4) | 0;
          l =
            kr(
              d[m >> 0] |
                (d[(m + 1) >> 0] << 8) |
                (d[(m + 2) >> 0] << 16) |
                (d[(m + 3) >> 0] << 24) |
                0,
              d[n >> 0] |
                (d[(n + 1) >> 0] << 8) |
                (d[(n + 2) >> 0] << 16) |
                (d[(n + 3) >> 0] << 24) |
                0,
              l | 0,
              ((((l | 0) < 0) << 31) >> 31) | 0
            ) | 0;
          n = H;
          m = o;
          a[m >> 0] = l;
          a[(m + 1) >> 0] = l >> 8;
          a[(m + 2) >> 0] = l >> 16;
          a[(m + 3) >> 0] = l >> 24;
          o = (o + 4) | 0;
          a[o >> 0] = n;
          a[(o + 1) >> 0] = n >> 8;
          a[(o + 2) >> 0] = n >> 16;
          a[(o + 3) >> 0] = n >> 24;
          c[(b + (c[g >> 2] << 2) + 148) >> 2] = 0;
          break;
        } else {
          if ((h | 0) <= 2) break;
          c[g >> 2] = (h + 2 + (c[g >> 2] | 0)) & 3;
          Uf(b, e) | 0;
          break;
        }
      } else {
        h = _f(e, (b + 4) | 0) | 0;
        if ((h | 0) == 1) {
          h = c[(b + (c[g >> 2] << 2) + 132) >> 2] | 0;
          e = (($f((b + 244) | 0, e, ((c[(b + 280) >> 2] | 0) + 44) | 0) | 0) + h) | 0;
          h = c[(b + 268) >> 2] | 0;
          if ((e | 0) < 0) e = (e + h) | 0;
          else e = (e - (e >>> 0 < h >>> 0 ? 0 : h)) | 0;
          o = (b + (c[g >> 2] << 3) + 100) | 0;
          l = o;
          n = l;
          l = (l + 4) | 0;
          l =
            kr(
              d[n >> 0] |
                (d[(n + 1) >> 0] << 8) |
                (d[(n + 2) >> 0] << 16) |
                (d[(n + 3) >> 0] << 24) |
                0,
              d[l >> 0] |
                (d[(l + 1) >> 0] << 8) |
                (d[(l + 2) >> 0] << 16) |
                (d[(l + 3) >> 0] << 24) |
                0,
              e | 0,
              ((((e | 0) < 0) << 31) >> 31) | 0
            ) | 0;
          n = H;
          m = o;
          a[m >> 0] = l;
          a[(m + 1) >> 0] = l >> 8;
          a[(m + 2) >> 0] = l >> 16;
          a[(m + 3) >> 0] = l >> 24;
          o = (o + 4) | 0;
          a[o >> 0] = n;
          a[(o + 1) >> 0] = n >> 8;
          a[(o + 2) >> 0] = n >> 16;
          a[(o + 3) >> 0] = n >> 24;
          c[(b + (c[g >> 2] << 2) + 148) >> 2] = 0;
          break;
        }
        if ((h | 0) >= 511) {
          if ((h | 0) != 512) {
            if ((h | 0) <= 511) break;
            c[g >> 2] = ((c[g >> 2] | 0) + h) & 3;
            Uf(b, e) | 0;
            break;
          }
          h = (b + 96) | 0;
          c[h >> 2] = ((c[h >> 2] | 0) + 1) & 3;
          k = (b + (c[g >> 2] << 3) + 104) | 0;
          k =
            d[k >> 0] | (d[(k + 1) >> 0] << 8) | (d[(k + 2) >> 0] << 16) | (d[(k + 3) >> 0] << 24);
          k = (($f((b + 244) | 0, e, ((c[(b + 280) >> 2] | 0) + 352) | 0) | 0) + k) | 0;
          j = c[(b + 268) >> 2] | 0;
          if ((k | 0) < 0) j = (k + j) | 0;
          else j = (k - (k >>> 0 < j >>> 0 ? 0 : j)) | 0;
          o = (((j | 0) < 0) << 31) >> 31;
          k = (b + (c[h >> 2] << 3) + 100) | 0;
          l = k;
          a[l >> 0] = j;
          a[(l + 1) >> 0] = j >> 8;
          a[(l + 2) >> 0] = j >> 16;
          a[(l + 3) >> 0] = j >> 24;
          k = (k + 4) | 0;
          a[k >> 0] = o;
          a[(k + 1) >> 0] = o >> 8;
          a[(k + 2) >> 0] = o >> 16;
          a[(k + 3) >> 0] = o >> 24;
          k = (b + (c[h >> 2] << 3) + 100) | 0;
          o = k;
          o =
            d[o >> 0] | (d[(o + 1) >> 0] << 8) | (d[(o + 2) >> 0] << 16) | (d[(o + 3) >> 0] << 24);
          l = k;
          a[l >> 0] = 0;
          a[(l + 1) >> 0] = 0;
          a[(l + 2) >> 0] = 0;
          a[(l + 3) >> 0] = 0;
          k = (k + 4) | 0;
          a[k >> 0] = o;
          a[(k + 1) >> 0] = o >> 8;
          a[(k + 2) >> 0] = o >> 16;
          a[(k + 3) >> 0] = o >> 24;
          k = (e + 4) | 0;
          o = c[k >> 2] | 0;
          l = (e + 8) | 0;
          m = (c[l >> 2] | 0) >>> 16;
          c[l >> 2] = m;
          j = ((o >>> 0) / (m >>> 0)) | 0;
          m = (o - (da(m, j) | 0)) | 0;
          c[k >> 2] = m;
          do {
            m = ((Wf(c[e >> 2] | 0) | 0) & 255) | (m << 8);
            c[k >> 2] = m;
            n = c[l >> 2] | 0;
            o = n << 8;
            c[l >> 2] = o;
          } while (o >>> 0 < 16777216);
          o = (n >>> 8) & 65535;
          c[l >> 2] = o;
          n = ((m >>> 0) / (o >>> 0)) | 0;
          m = (m - (da(n, o) | 0)) | 0;
          c[k >> 2] = m;
          do {
            m = ((Wf(c[e >> 2] | 0) | 0) & 255) | (m << 8);
            c[k >> 2] = m;
            o = c[l >> 2] << 8;
            c[l >> 2] = o;
          } while (o >>> 0 < 16777216);
          o = (b + (c[h >> 2] << 3) + 100) | 0;
          m = o;
          l = m;
          m = (m + 4) | 0;
          m =
            d[m >> 0] | (d[(m + 1) >> 0] << 8) | (d[(m + 2) >> 0] << 16) | (d[(m + 3) >> 0] << 24);
          l =
            d[l >> 0] |
            (d[(l + 1) >> 0] << 8) |
            (d[(l + 2) >> 0] << 16) |
            (d[(l + 3) >> 0] << 24) |
            ((n << 16) | (j & 65535));
          n = o;
          a[n >> 0] = l;
          a[(n + 1) >> 0] = l >> 8;
          a[(n + 2) >> 0] = l >> 16;
          a[(n + 3) >> 0] = l >> 24;
          o = (o + 4) | 0;
          a[o >> 0] = m;
          a[(o + 1) >> 0] = m >> 8;
          a[(o + 2) >> 0] = m >> 16;
          a[(o + 3) >> 0] = m >> 24;
          o = c[h >> 2] | 0;
          c[g >> 2] = o;
          c[(b + (o << 2) + 132) >> 2] = 0;
          c[(b + (c[g >> 2] << 2) + 148) >> 2] = 0;
          break;
        }
        do
          if (!h) {
            e = $f((b + 244) | 0, e, ((c[(b + 280) >> 2] | 0) + 308) | 0) | 0;
            h = c[(b + 268) >> 2] | 0;
            if ((e | 0) < 0) e = (h + e) | 0;
            else e = (e - (e >>> 0 < h >>> 0 ? 0 : h)) | 0;
            h = (b + (c[g >> 2] << 2) + 148) | 0;
            c[h >> 2] = (c[h >> 2] | 0) + 1;
            h = c[g >> 2] | 0;
            if ((c[(b + (h << 2) + 148) >> 2] | 0) > 3) {
              c[(b + (h << 2) + 132) >> 2] = e;
              c[(b + (c[g >> 2] << 2) + 148) >> 2] = 0;
            }
          } else {
            if ((h | 0) < 500) {
              l = (b + 244) | 0;
              j = da(c[(b + (c[g >> 2] << 2) + 132) >> 2] | 0, h) | 0;
              k = c[(b + 280) >> 2] | 0;
              if ((h | 0) < 10) {
                h = (($f(l, e, (k + 88) | 0) | 0) + j) | 0;
                e = c[(b + 268) >> 2] | 0;
                if ((h | 0) < 0) {
                  e = (h + e) | 0;
                  break;
                } else {
                  e = (h - (h >>> 0 < e >>> 0 ? 0 : e)) | 0;
                  break;
                }
              } else {
                h = (($f(l, e, (k + 132) | 0) | 0) + j) | 0;
                e = c[(b + 268) >> 2] | 0;
                if ((h | 0) < 0) {
                  e = (h + e) | 0;
                  break;
                } else {
                  e = (h - (h >>> 0 < e >>> 0 ? 0 : e)) | 0;
                  break;
                }
              }
            }
            if ((h | 0) == 500) {
              h = ((c[(b + (c[g >> 2] << 2) + 132) >> 2] | 0) * 500) | 0;
              h = (($f((b + 244) | 0, e, ((c[(b + 280) >> 2] | 0) + 176) | 0) | 0) + h) | 0;
              e = c[(b + 268) >> 2] | 0;
              if ((h | 0) < 0) e = (h + e) | 0;
              else e = (h - (h >>> 0 < e >>> 0 ? 0 : e)) | 0;
              h = (b + (c[g >> 2] << 2) + 148) | 0;
              c[h >> 2] = (c[h >> 2] | 0) + 1;
              h = c[g >> 2] | 0;
              if ((c[(b + (h << 2) + 148) >> 2] | 0) <= 3) break;
              c[(b + (h << 2) + 132) >> 2] = e;
              c[(b + (c[g >> 2] << 2) + 148) >> 2] = 0;
              break;
            }
            h = (500 - h) | 0;
            k = (b + 244) | 0;
            j = c[(b + (c[g >> 2] << 2) + 132) >> 2] | 0;
            if ((h | 0) > -10) {
              h = da(j, h) | 0;
              h = (($f(k, e, ((c[(b + 280) >> 2] | 0) + 220) | 0) | 0) + h) | 0;
              e = c[(b + 268) >> 2] | 0;
              if ((h | 0) < 0) {
                e = (h + e) | 0;
                break;
              } else {
                e = (h - (h >>> 0 < e >>> 0 ? 0 : e)) | 0;
                break;
              }
            }
            h = da(j, -10) | 0;
            e = (($f(k, e, ((c[(b + 280) >> 2] | 0) + 264) | 0) | 0) + h) | 0;
            h = c[(b + 268) >> 2] | 0;
            if ((e | 0) < 0) h = (e + h) | 0;
            else h = (e - (e >>> 0 < h >>> 0 ? 0 : h)) | 0;
            e = (b + (c[g >> 2] << 2) + 148) | 0;
            c[e >> 2] = (c[e >> 2] | 0) + 1;
            e = c[g >> 2] | 0;
            if ((c[(b + (e << 2) + 148) >> 2] | 0) > 3) {
              c[(b + (e << 2) + 132) >> 2] = h;
              c[(b + (c[g >> 2] << 2) + 148) >> 2] = 0;
              e = h;
            } else e = h;
          }
        while (0);
        o = (b + (c[g >> 2] << 3) + 100) | 0;
        l = o;
        n = l;
        l = (l + 4) | 0;
        l =
          kr(
            d[n >> 0] |
              (d[(n + 1) >> 0] << 8) |
              (d[(n + 2) >> 0] << 16) |
              (d[(n + 3) >> 0] << 24) |
              0,
            d[l >> 0] |
              (d[(l + 1) >> 0] << 8) |
              (d[(l + 2) >> 0] << 16) |
              (d[(l + 3) >> 0] << 24) |
              0,
            e | 0,
            ((((e | 0) < 0) << 31) >> 31) | 0
          ) | 0;
        n = H;
        m = o;
        a[m >> 0] = l;
        a[(m + 1) >> 0] = l >> 8;
        a[(m + 2) >> 0] = l >> 16;
        a[(m + 3) >> 0] = l >> 24;
        o = (o + 4) | 0;
        a[o >> 0] = n;
        a[(o + 1) >> 0] = n >> 8;
        a[(o + 2) >> 0] = n >> 16;
        a[(o + 3) >> 0] = n >> 24;
      }
    while (0);
    n = (b + (c[g >> 2] << 3) + 100) | 0;
    o = n;
    n = (n + 4) | 0;
    n = d[n >> 0] | (d[(n + 1) >> 0] << 8) | (d[(n + 2) >> 0] << 16) | (d[(n + 3) >> 0] << 24);
    o = d[o >> 0] | (d[(o + 1) >> 0] << 8) | (d[(o + 2) >> 0] << 16) | (d[(o + 3) >> 0] << 24);
    H = n;
    i = f;
    return o | 0;
  }
  function Vf(b, e, f) {
    b = b | 0;
    e = e | 0;
    f = f | 0;
    var g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0;
    g = i;
    i = (i + 16) | 0;
    h = g;
    if (!(a[b >> 0] | 0)) {
      a[b >> 0] = 1;
      Zf(c[e >> 2] | 0, h, 6);
      u = (a[(h + 1) >> 0] << 8) | d[h >> 0];
      j = u & 65535;
      l = a[(h + 2) >> 0] | 0;
      k = ((a[(h + 3) >> 0] << 8) | (l & 255)) & 65535;
      n = a[(h + 4) >> 0] | 0;
      m = ((a[(h + 5) >> 0] << 8) | (n & 255)) & 65535;
      h = (b + 1) | 0;
      a[h >> 0] = j;
      a[(h + 1) >> 0] = j >> 8;
      h = (b + 3) | 0;
      a[h >> 0] = k;
      a[(h + 1) >> 0] = k >> 8;
      h = (b + 5) | 0;
      a[h >> 0] = m;
      a[(h + 1) >> 0] = m >> 8;
      h = u;
      m = ((m & 65535) >>> 8) & 255;
    } else {
      l = _f(e, (b + 8) | 0) | 0;
      if (!(l & 1)) {
        m = (b + 1) | 0;
        m = d[m >> 0] | (d[(m + 1) >> 0] << 8);
        h = m & 255;
      } else {
        h = (_f(e, (b + 52) | 0) | 0) & 255;
        m = (b + 1) | 0;
        m = d[m >> 0] | (d[(m + 1) >> 0] << 8);
        h = ((m & 255) + h) | 0;
        h = (h | 0) > 255 ? (h + 65280) | 0 : h;
      }
      if (!(l & 2)) h = (m & 65280) | (h & 65535);
      else {
        u = (_f(e, (b + 96) | 0) | 0) & 255;
        m = (b + 1) | 0;
        m = d[m >> 0] | (d[(m + 1) >> 0] << 8);
        u = (((m & 65535) >>> 8) + u) | 0;
        h = (((u | 0) > 255 ? (u + 65280) | 0 : u) << 8) | (h & 65535);
      }
      j = h & 65535;
      do
        if (!(l & 64)) {
          k = (b + 1) | 0;
          l = (b + 5) | 0;
          n = j;
          m = j;
        } else {
          k = (b + 1) | 0;
          m = ((h & 255) - (m & 255)) | 0;
          do
            if (l & 4) {
              p = _f(e, (b + 140) | 0) | 0;
              n = p & 255;
              o = (b + 3) | 0;
              o = d[o >> 0] | (d[(o + 1) >> 0] << 8);
              q = o & 65535;
              r = ((q & 255) + m) | 0;
              s = (r | 0) < 1;
              if (((r + -1) | 0) >>> 0 > 253) t = s ? 0 : 255;
              else t = (q + m) & 255;
              if (((t + n) | 0) > 255) {
                if (!s)
                  if ((r | 0) > 254) n = 255;
                  else n = (q + m) & 255;
                else n = 0;
                n = ((p | -256) + n) | 0;
                break;
              } else {
                if (!s)
                  if ((r | 0) > 254) p = 255;
                  else p = (q + m) & 255;
                else p = 0;
                n = (p + n) | 0;
                break;
              }
            } else {
              o = (b + 3) | 0;
              o = d[o >> 0] | (d[(o + 1) >> 0] << 8);
              n = o & 255;
            }
          while (0);
          do
            if (l & 16) {
              p = _f(e, (b + 228) | 0) | 0;
              o = (b + 3) | 0;
              o = d[o >> 0] | (d[(o + 1) >> 0] << 8);
              r = ((((n & 255) + m - (o & 255)) | 0) / 2) | 0;
              m = p & 255;
              t = (b + 5) | 0;
              t = (d[t >> 0] | (d[(t + 1) >> 0] << 8)) & 65535;
              u = ((t & 255) + r) | 0;
              s = (u | 0) < 1;
              if (((u + -1) | 0) >>> 0 > 253) q = s ? 0 : 255;
              else q = (t + r) & 255;
              if (((q + m) | 0) > 255) {
                if (!s)
                  if ((u | 0) > 254) m = 255;
                  else m = (t + r) & 255;
                else m = 0;
                m = ((p | -256) + m) | 0;
                p = o;
                break;
              } else {
                if (!s)
                  if ((u | 0) > 254) p = 255;
                  else p = (t + r) & 255;
                else p = 0;
                m = (p + m) | 0;
                p = o;
                break;
              }
            } else {
              m = (b + 5) | 0;
              m = (d[m >> 0] | (d[(m + 1) >> 0] << 8)) & 255;
              p = o;
            }
          while (0);
          o = (((h >>> 8) & 255) - (((d[k >> 0] | (d[(k + 1) >> 0] << 8)) & 65535) >>> 8)) | 0;
          if (!(l & 8)) r = (p & 65280) | (n & 65535);
          else {
            p = _f(e, (b + 184) | 0) | 0;
            q = p & 255;
            t = (b + 3) | 0;
            t = ((((d[t >> 0] | (d[(t + 1) >> 0] << 8)) & 65535) >>> 8) + o) | 0;
            r = (t | 0) < 1;
            if (r) s = 0;
            else s = (t | 0) > 254 ? 255 : t & 255;
            if (((s + q) | 0) > 255) {
              if (r) q = 0;
              else q = (t | 0) > 254 ? 255 : t & 255;
              p = ((p | -256) + q) | 0;
            } else {
              if (r) p = 0;
              else p = (t | 0) > 254 ? 255 : t & 255;
              p = (p + q) | 0;
            }
            r = (p << 8) | (n & 65535);
          }
          n = r & 65535;
          if (!(l & 32)) {
            u = (b + 5) | 0;
            l = u;
            m = (((d[u >> 0] | (d[(u + 1) >> 0] << 8)) & 65280) | m) & 65535;
            break;
          }
          q = _f(e, (b + 272) | 0) | 0;
          u = (b + 3) | 0;
          p = q & 255;
          l = (b + 5) | 0;
          r =
            ((((d[l >> 0] | (d[(l + 1) >> 0] << 8)) & 65535) >>> 8) +
              ((((((r >>> 8) & 255) + o - (((d[u >> 0] | (d[(u + 1) >> 0] << 8)) & 65535) >>> 8)) |
                0) /
                2) |
                0)) |
            0;
          o = (r | 0) < 1;
          if (o) s = 0;
          else s = (r | 0) > 254 ? 255 : r & 255;
          if (((s + p) | 0) > 255) {
            if (o) o = 0;
            else o = (r | 0) > 254 ? 255 : r & 255;
            o = ((q | -256) + o) | 0;
          } else {
            if (o) o = 0;
            else o = (r | 0) > 254 ? 255 : r & 255;
            o = (o + p) | 0;
          }
          m = ((o << 8) | m) & 65535;
        }
      while (0);
      a[k >> 0] = j;
      a[(k + 1) >> 0] = j >> 8;
      k = (b + 3) | 0;
      a[k >> 0] = n;
      a[(k + 1) >> 0] = n >> 8;
      a[l >> 0] = m;
      a[(l + 1) >> 0] = m >> 8;
      k = n;
      l = n & 255;
      n = m & 255;
      m = ((m & 65535) >>> 8) & 255;
    }
    a[(f + 1) >> 0] = (j & 65535) >>> 8;
    a[f >> 0] = h;
    a[(f + 3) >> 0] = (k & 65535) >>> 8;
    a[(f + 2) >> 0] = l;
    a[(f + 5) >> 0] = m;
    a[(f + 4) >> 0] = n;
    f = (b + 316) | 0;
    if (!(a[f >> 0] | 0)) {
      i = g;
      return;
    }
    u = ((Wf(c[e >> 2] | 0) | 0) & 255) << 24;
    u = (((Wf(c[e >> 2] | 0) | 0) & 255) << 16) | u;
    u = u | (((Wf(c[e >> 2] | 0) | 0) & 255) << 8);
    c[(e + 4) >> 2] = u | ((Wf(c[e >> 2] | 0) | 0) & 255);
    a[f >> 0] = 0;
    i = g;
    return;
  }
  function Wf(b) {
    b = b | 0;
    var d = 0,
      e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0;
    f = i;
    d = (b + 4) | 0;
    g = c[d >> 2] | 0;
    e = (b + 8) | 0;
    if ((g | 0) < (c[e >> 2] | 0)) {
      h = g;
      g = (h + 1) | 0;
      c[d >> 2] = g;
      g = (b + 12) | 0;
      g = c[g >> 2] | 0;
      h = (g + h) | 0;
      h = a[h >> 0] | 0;
      i = f;
      return h | 0;
    }
    c[d >> 2] = 0;
    g = c[b >> 2] | 0;
    h = (g + 13) | 0;
    if (!(a[h >> 0] | 0)) {
      j = (g + 4) | 0;
      m = (g + 8) | 0;
      k = c[m >> 2] | 0;
      l = ((c[j >> 2] | 0) - k) | 0;
      l = (l | 0) < 1048576 ? l : 1048576;
      pr(c[(b + 12) >> 2] | 0, ((c[g >> 2] | 0) + k) | 0, l | 0) | 0;
      k = ((c[m >> 2] | 0) + l) | 0;
      c[m >> 2] = k;
      c[(g + 16) >> 2] = l;
      if ((k | 0) >= (c[j >> 2] | 0)) a[h >> 0] = 1;
    } else a[(g + 12) >> 0] = 1;
    m = c[((c[b >> 2] | 0) + 16) >> 2] | 0;
    c[e >> 2] = m;
    if (m) {
      m = c[d >> 2] | 0;
      l = (m + 1) | 0;
      c[d >> 2] = l;
      l = (b + 12) | 0;
      l = c[l >> 2] | 0;
      m = (l + m) | 0;
      m = a[m >> 0] | 0;
      i = f;
      return m | 0;
    }
    b = Wb(8) | 0;
    c[b >> 2] = 27520;
    d = (b + 4) | 0;
    e = Tq(32) | 0;
    a: do
      if (!e) {
        while (1) {
          e = c[6860] | 0;
          c[6860] = e + 0;
          if (!e) break;
          qd[e & 3]();
          e = Tq(32) | 0;
          if (e) break a;
        }
        m = Wb(4) | 0;
        c[m >> 2] = 27280;
        Zc(m | 0, 27328, 220);
      }
    while (0);
    c[e >> 2] = 19;
    c[(e + 4) >> 2] = 19;
    c[(e + 8) >> 2] = 0;
    f = (e + 12) | 0;
    h = (f + 0) | 0;
    g = 5720;
    e = (h + 20) | 0;
    do {
      a[h >> 0] = a[g >> 0] | 0;
      h = (h + 1) | 0;
      g = (g + 1) | 0;
    } while ((h | 0) < (e | 0));
    c[d >> 2] = f;
    c[b >> 2] = 5752;
    Zc(b | 0, 5704, 55);
    return 0;
  }
  function Xf(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0;
    b = i;
    c[a >> 2] = 27520;
    a = (a + 4) | 0;
    e = ((c[a >> 2] | 0) + -4) | 0;
    d = c[e >> 2] | 0;
    c[e >> 2] = d + -1;
    if (((d + -1) | 0) >= 0) {
      i = b;
      return;
    }
    Uq(((c[a >> 2] | 0) + -12) | 0);
    i = b;
    return;
  }
  function Yf(a) {
    a = a | 0;
    var b = 0,
      d = 0,
      e = 0,
      f = 0;
    b = i;
    c[a >> 2] = 27520;
    d = (a + 4) | 0;
    f = ((c[d >> 2] | 0) + -4) | 0;
    e = c[f >> 2] | 0;
    c[f >> 2] = e + -1;
    if (((e + -1) | 0) >= 0) {
      Uq(a);
      i = b;
      return;
    }
    Uq(((c[d >> 2] | 0) + -12) | 0);
    Uq(a);
    i = b;
    return;
  }
  function Zf(b, d, e) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    var f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0;
    g = i;
    h = (b + 4) | 0;
    k = c[h >> 2] | 0;
    j = (b + 8) | 0;
    do
      if ((k | 0) < (c[j >> 2] | 0)) j = k;
      else {
        c[h >> 2] = 0;
        k = c[b >> 2] | 0;
        l = (k + 13) | 0;
        if (!(a[l >> 0] | 0)) {
          m = (k + 4) | 0;
          p = (k + 8) | 0;
          n = c[p >> 2] | 0;
          o = ((c[m >> 2] | 0) - n) | 0;
          o = (o | 0) < 1048576 ? o : 1048576;
          pr(c[(b + 12) >> 2] | 0, ((c[k >> 2] | 0) + n) | 0, o | 0) | 0;
          n = ((c[p >> 2] | 0) + o) | 0;
          c[p >> 2] = n;
          c[(k + 16) >> 2] = o;
          if ((n | 0) >= (c[m >> 2] | 0)) a[l >> 0] = 1;
        } else a[(k + 12) >> 0] = 1;
        p = c[((c[b >> 2] | 0) + 16) >> 2] | 0;
        c[j >> 2] = p;
        if (p) {
          j = c[h >> 2] | 0;
          break;
        }
        e = Wb(8) | 0;
        c[e >> 2] = 27520;
        g = (e + 4) | 0;
        h = Tq(32) | 0;
        if (h) {
          c[h >> 2] = 19;
          d = (h + 4) | 0;
          c[d >> 2] = 19;
          d = (h + 8) | 0;
          c[d >> 2] = 0;
          h = (h + 12) | 0;
          d = (h + 0) | 0;
          b = 5720;
          f = (d + 20) | 0;
          do {
            a[d >> 0] = a[b >> 0] | 0;
            d = (d + 1) | 0;
            b = (b + 1) | 0;
          } while ((d | 0) < (f | 0));
          c[g >> 2] = h;
          c[e >> 2] = 5752;
          Zc(e | 0, 5704, 55);
        }
        while (1) {
          h = c[6860] | 0;
          c[6860] = h + 0;
          if (!h) break;
          qd[h & 3]();
          h = Tq(32) | 0;
          if (h) {
            f = 14;
            break;
          }
        }
        if ((f | 0) == 14) {
          c[h >> 2] = 19;
          d = (h + 4) | 0;
          c[d >> 2] = 19;
          d = (h + 8) | 0;
          c[d >> 2] = 0;
          h = (h + 12) | 0;
          d = (h + 0) | 0;
          b = 5720;
          f = (d + 20) | 0;
          do {
            a[d >> 0] = a[b >> 0] | 0;
            d = (d + 1) | 0;
            b = (b + 1) | 0;
          } while ((d | 0) < (f | 0));
          c[g >> 2] = h;
          c[e >> 2] = 5752;
          Zc(e | 0, 5704, 55);
        }
        p = Wb(4) | 0;
        c[p >> 2] = 27280;
        Zc(p | 0, 27328, 220);
      }
    while (0);
    b = c[(b + 12) >> 2] | 0;
    f = (b + (j + e)) | 0;
    if (!e) {
      p = j;
      p = (p + e) | 0;
      c[h >> 2] = p;
      i = g;
      return;
    }
    b = (b + j) | 0;
    while (1) {
      a[d >> 0] = a[b >> 0] | 0;
      b = (b + 1) | 0;
      if ((b | 0) == (f | 0)) break;
      else d = (d + 1) | 0;
    }
    p = c[h >> 2] | 0;
    p = (p + e) | 0;
    c[h >> 2] = p;
    i = g;
    return;
  }
  function _f(a, b) {
    a = a | 0;
    b = b | 0;
    var d = 0,
      e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0;
    e = i;
    d = (a + 8) | 0;
    f = c[d >> 2] | 0;
    h = c[(b + 16) >> 2] | 0;
    if (h) {
      j = c[(a + 4) >> 2] | 0;
      g = f >>> 15;
      c[d >> 2] = g;
      l = ((j >>> 0) / (g >>> 0)) | 0;
      m = l >>> (c[(b + 40) >> 2] | 0);
      k = c[(h + (m << 2)) >> 2] | 0;
      m = ((c[(h + ((m + 1) << 2)) >> 2] | 0) + 1) | 0;
      n = (k + 1) | 0;
      h = c[(b + 8) >> 2] | 0;
      if (m >>> 0 > n >>> 0) {
        do {
          n = ((m + k) | 0) >>> 1;
          o = (c[(h + (n << 2)) >> 2] | 0) >>> 0 > l >>> 0;
          k = o ? k : n;
          m = o ? n : m;
          n = (k + 1) | 0;
        } while (m >>> 0 > n >>> 0);
        l = n;
      } else l = n;
      n = da(g, c[(h + (k << 2)) >> 2] | 0) | 0;
      if ((k | 0) != (c[(b + 32) >> 2] | 0)) f = da(c[(h + (l << 2)) >> 2] | 0, g) | 0;
    } else {
      h = f >>> 15;
      c[d >> 2] = h;
      l = c[b >> 2] | 0;
      g = c[(b + 8) >> 2] | 0;
      j = c[(a + 4) >> 2] | 0;
      m = l >>> 1;
      k = 0;
      n = 0;
      do {
        p = da(c[(g + (m << 2)) >> 2] | 0, h) | 0;
        o = p >>> 0 > j >>> 0;
        f = o ? p : f;
        n = o ? n : p;
        k = o ? k : m;
        l = o ? m : l;
        m = ((k + l) | 0) >>> 1;
      } while ((m | 0) != (k | 0));
    }
    g = (a + 4) | 0;
    h = (j - n) | 0;
    c[g >> 2] = h;
    p = (f - n) | 0;
    c[d >> 2] = p;
    if (p >>> 0 < 16777216)
      do {
        h = ((Wf(c[a >> 2] | 0) | 0) & 255) | (h << 8);
        c[g >> 2] = h;
        p = c[d >> 2] << 8;
        c[d >> 2] = p;
      } while (p >>> 0 < 16777216);
    o = ((c[(b + 12) >> 2] | 0) + (k << 2)) | 0;
    c[o >> 2] = (c[o >> 2] | 0) + 1;
    o = (b + 28) | 0;
    p = ((c[o >> 2] | 0) + -1) | 0;
    c[o >> 2] = p;
    if (p) {
      i = e;
      return k | 0;
    }
    ke(b);
    i = e;
    return k | 0;
  }
  function $f(a, b, d) {
    a = a | 0;
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0;
    e = i;
    f = _f(b, d) | 0;
    c[a >> 2] = f;
    if (f) {
      if (f >>> 0 >= 32) {
        l = c[(a + 28) >> 2] | 0;
        i = e;
        return l | 0;
      }
      d = c[(a + 12) >> 2] | 0;
      if (f >>> 0 > d >>> 0) {
        d = (f - d) | 0;
        l = _f(b, ((c[(a + 68) >> 2] | 0) + ((((f + -1) | 0) * 44) | 0)) | 0) | 0;
        d = (l << d) | (ag(b, d) | 0);
      } else d = _f(b, ((c[(a + 68) >> 2] | 0) + ((((f + -1) | 0) * 44) | 0)) | 0) | 0;
      a = c[a >> 2] | 0;
      if ((d | 0) < ((1 << (a + -1)) | 0)) {
        l = (d + 1 + (-1 << a)) | 0;
        i = e;
        return l | 0;
      } else {
        l = (d + 1) | 0;
        i = e;
        return l | 0;
      }
    }
    f = (a + 56) | 0;
    h = (b + 8) | 0;
    l = c[h >> 2] | 0;
    j = da(l >>> 13, c[f >> 2] | 0) | 0;
    g = (b + 4) | 0;
    k = c[g >> 2] | 0;
    m = k >>> 0 >= j >>> 0;
    d = m & 1;
    if (m) {
      c[g >> 2] = k - j;
      j = (l - j) | 0;
      c[h >> 2] = j;
    } else {
      c[h >> 2] = j;
      j = (a + 60) | 0;
      c[j >> 2] = (c[j >> 2] | 0) + 1;
      j = c[h >> 2] | 0;
    }
    if (j >>> 0 < 16777216) {
      j = c[g >> 2] | 0;
      do {
        j = ((Wf(c[b >> 2] | 0) | 0) & 255) | (j << 8);
        c[g >> 2] = j;
        m = c[h >> 2] << 8;
        c[h >> 2] = m;
      } while (m >>> 0 < 16777216);
    }
    h = (a + 52) | 0;
    m = ((c[h >> 2] | 0) + -1) | 0;
    c[h >> 2] = m;
    if (m) {
      m = d;
      i = e;
      return m | 0;
    }
    b = (a + 48) | 0;
    g = c[b >> 2] | 0;
    j = (a + 64) | 0;
    k = ((c[j >> 2] | 0) + g) | 0;
    c[j >> 2] = k;
    if (k >>> 0 > 8192) {
      k = ((k + 1) | 0) >>> 1;
      c[j >> 2] = k;
      m = (a + 60) | 0;
      a = (((c[m >> 2] | 0) + 1) | 0) >>> 1;
      c[m >> 2] = a;
      if ((a | 0) == (k | 0)) {
        m = (k + 1) | 0;
        c[j >> 2] = m;
        j = m;
      } else {
        j = k;
        k = a;
      }
    } else {
      j = k;
      k = c[(a + 60) >> 2] | 0;
    }
    c[f >> 2] = (da((2147483648 / (j >>> 0)) | 0, k) | 0) >>> 18;
    m = (g * 5) | 0;
    m = m >>> 0 > 259 ? 64 : m >>> 2;
    c[b >> 2] = m;
    c[h >> 2] = m;
    m = d;
    i = e;
    return m | 0;
  }
  function ag(a, b) {
    a = a | 0;
    b = b | 0;
    var d = 0,
      e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0;
    f = i;
    d = (a + 4) | 0;
    g = c[d >> 2] | 0;
    e = (a + 8) | 0;
    h = c[e >> 2] | 0;
    if (b >>> 0 > 19) {
      j = h >>> 16;
      c[e >> 2] = j;
      h = ((g >>> 0) / (j >>> 0)) | 0;
      g = (g - (da(h, j) | 0)) | 0;
      c[d >> 2] = g;
      do {
        g = ((Wf(c[a >> 2] | 0) | 0) & 255) | (g << 8);
        c[d >> 2] = g;
        j = c[e >> 2] << 8;
        c[e >> 2] = j;
      } while (j >>> 0 < 16777216);
      j = ((ag(a, (b + -16) | 0) | 0) << 16) | (h & 65535);
      i = f;
      return j | 0;
    }
    j = h >>> b;
    c[e >> 2] = j;
    b = ((g >>> 0) / (j >>> 0)) | 0;
    g = (g - (da(b, j) | 0)) | 0;
    c[d >> 2] = g;
    if (j >>> 0 >= 16777216) {
      i = f;
      return b | 0;
    }
    do {
      g = ((Wf(c[a >> 2] | 0) | 0) & 255) | (g << 8);
      c[d >> 2] = g;
      j = c[e >> 2] << 8;
      c[e >> 2] = j;
    } while (j >>> 0 < 16777216);
    i = f;
    return b | 0;
  }
  function bg(a) {
    a = a | 0;
    return;
  }
  function cg(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function dg(a) {
    a = a | 0;
    var b = 0;
    b = i;
    a = c[(a + 12) >> 2] | 0;
    if (!a) {
      i = b;
      return;
    }
    jd[c[((c[a >> 2] | 0) + 8) >> 2] & 255](a);
    i = b;
    return;
  }
  function eg(a, b) {
    a = a | 0;
    b = b | 0;
    if ((c[(b + 4) >> 2] | 0) == 6304) a = (a + 12) | 0;
    else a = 0;
    return a | 0;
  }
  function fg(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function gg(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0;
    e = i;
    i = (i + 32) | 0;
    g = e;
    f = c[(b + 8) >> 2] | 0;
    b = c[(b + 4) >> 2] | 0;
    Tf(g, f, b);
    h = c[g >> 2] | 0;
    a[(d + 3) >> 0] = h >>> 24;
    a[(d + 2) >> 0] = h >>> 16;
    a[(d + 1) >> 0] = h >>> 8;
    a[d >> 0] = h;
    h = c[(g + 4) >> 2] | 0;
    a[(d + 7) >> 0] = h >>> 24;
    a[(d + 6) >> 0] = h >>> 16;
    a[(d + 5) >> 0] = h >>> 8;
    a[(d + 4) >> 0] = h;
    h = c[(g + 8) >> 2] | 0;
    a[(d + 11) >> 0] = h >>> 24;
    a[(d + 10) >> 0] = h >>> 16;
    a[(d + 9) >> 0] = h >>> 8;
    a[(d + 8) >> 0] = h;
    h = c[(g + 12) >> 2] | 0;
    a[(d + 13) >> 0] = (h & 65535) >>> 8;
    a[(d + 12) >> 0] = h;
    a[(d + 14) >> 0] = h >>> 16;
    a[(d + 15) >> 0] = h >>> 24;
    g = c[(g + 16) >> 2] | 0;
    a[(d + 16) >> 0] = g;
    a[(d + 17) >> 0] = (g & 65535) >>> 8;
    a[(d + 19) >> 0] = g >>> 24;
    a[(d + 18) >> 0] = g >>> 16;
    Vf((f + 4784) | 0, b, (d + 20) | 0);
    i = e;
    return;
  }
  function hg(a) {
    a = a | 0;
    var b = 0;
    b = i;
    c[a >> 2] = 6616;
    a = c[(a + 8) >> 2] | 0;
    if (!a) {
      i = b;
      return;
    }
    Mf((a + 4784) | 0);
    Jf(a);
    Uq(a);
    i = b;
    return;
  }
  function ig(a) {
    a = a | 0;
    var b = 0,
      d = 0;
    b = i;
    c[a >> 2] = 6616;
    d = c[(a + 8) >> 2] | 0;
    if (!d) {
      Uq(a);
      i = b;
      return;
    }
    Mf((d + 4784) | 0);
    Jf(d);
    Uq(d);
    Uq(a);
    i = b;
    return;
  }
  function jg(a) {
    a = a | 0;
    return;
  }
  function kg(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function lg(a) {
    a = a | 0;
    var b = 0;
    b = i;
    a = c[(a + 12) >> 2] | 0;
    if (!a) {
      i = b;
      return;
    }
    jd[c[((c[a >> 2] | 0) + 8) >> 2] & 255](a);
    i = b;
    return;
  }
  function mg(a, b) {
    a = a | 0;
    b = b | 0;
    if ((c[(b + 4) >> 2] | 0) == 7272) a = (a + 12) | 0;
    else a = 0;
    return a | 0;
  }
  function ng(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function og(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0;
    e = i;
    i = (i + 32) | 0;
    h = e;
    f = c[(b + 8) >> 2] | 0;
    b = c[(b + 4) >> 2] | 0;
    Tf(h, f, b);
    g = c[h >> 2] | 0;
    a[(d + 3) >> 0] = g >>> 24;
    a[(d + 2) >> 0] = g >>> 16;
    a[(d + 1) >> 0] = g >>> 8;
    a[d >> 0] = g;
    g = c[(h + 4) >> 2] | 0;
    a[(d + 7) >> 0] = g >>> 24;
    a[(d + 6) >> 0] = g >>> 16;
    a[(d + 5) >> 0] = g >>> 8;
    a[(d + 4) >> 0] = g;
    g = c[(h + 8) >> 2] | 0;
    a[(d + 11) >> 0] = g >>> 24;
    a[(d + 10) >> 0] = g >>> 16;
    a[(d + 9) >> 0] = g >>> 8;
    a[(d + 8) >> 0] = g;
    g = c[(h + 12) >> 2] | 0;
    a[(d + 13) >> 0] = (g & 65535) >>> 8;
    a[(d + 12) >> 0] = g;
    a[(d + 14) >> 0] = g >>> 16;
    a[(d + 15) >> 0] = g >>> 24;
    h = c[(h + 16) >> 2] | 0;
    a[(d + 16) >> 0] = h;
    a[(d + 17) >> 0] = (h & 65535) >>> 8;
    a[(d + 19) >> 0] = h >>> 24;
    a[(d + 18) >> 0] = h >>> 16;
    h = Uf((f + 4784) | 0, b) | 0;
    g = H;
    a[(d + 23) >> 0] = h >>> 24;
    a[(d + 22) >> 0] = h >>> 16;
    a[(d + 21) >> 0] = h >>> 8;
    a[(d + 20) >> 0] = h;
    j = lr(h | 0, g | 0, 56) | 0;
    a[(d + 27) >> 0] = j;
    j = lr(h | 0, g | 0, 48) | 0;
    a[(d + 26) >> 0] = j;
    h = lr(h | 0, g | 0, 40) | 0;
    a[(d + 25) >> 0] = h;
    a[(d + 24) >> 0] = g;
    d = (f + 5112) | 0;
    if (!(a[d >> 0] | 0)) {
      i = e;
      return;
    }
    j = ((Wf(c[b >> 2] | 0) | 0) & 255) << 24;
    j = (((Wf(c[b >> 2] | 0) | 0) & 255) << 16) | j;
    j = j | (((Wf(c[b >> 2] | 0) | 0) & 255) << 8);
    c[(b + 4) >> 2] = j | ((Wf(c[b >> 2] | 0) | 0) & 255);
    a[d >> 0] = 0;
    i = e;
    return;
  }
  function pg(a) {
    a = a | 0;
    var b = 0;
    b = i;
    c[a >> 2] = 7560;
    a = c[(a + 8) >> 2] | 0;
    if (!a) {
      i = b;
      return;
    }
    pe((a + 5096) | 0);
    pe((a + 5064) | 0);
    oe((a + 4948) | 0);
    Lf((a + 4784) | 0);
    Jf(a);
    Uq(a);
    i = b;
    return;
  }
  function qg(a) {
    a = a | 0;
    var b = 0,
      d = 0;
    b = i;
    c[a >> 2] = 7560;
    d = c[(a + 8) >> 2] | 0;
    if (!d) {
      Uq(a);
      i = b;
      return;
    }
    pe((d + 5096) | 0);
    pe((d + 5064) | 0);
    oe((d + 4948) | 0);
    Lf((d + 4784) | 0);
    Jf(d);
    Uq(d);
    Uq(a);
    i = b;
    return;
  }
  function rg(a) {
    a = a | 0;
    return;
  }
  function sg(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function tg(a) {
    a = a | 0;
    var b = 0;
    b = i;
    a = c[(a + 12) >> 2] | 0;
    if (!a) {
      i = b;
      return;
    }
    jd[c[((c[a >> 2] | 0) + 8) >> 2] & 255](a);
    i = b;
    return;
  }
  function ug(a, b) {
    a = a | 0;
    b = b | 0;
    if ((c[(b + 4) >> 2] | 0) == 8216) a = (a + 12) | 0;
    else a = 0;
    return a | 0;
  }
  function vg(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function wg(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0;
    e = i;
    i = (i + 32) | 0;
    g = e;
    f = c[(b + 8) >> 2] | 0;
    b = c[(b + 4) >> 2] | 0;
    Tf(g, f, b);
    h = c[g >> 2] | 0;
    a[(d + 3) >> 0] = h >>> 24;
    a[(d + 2) >> 0] = h >>> 16;
    a[(d + 1) >> 0] = h >>> 8;
    a[d >> 0] = h;
    h = c[(g + 4) >> 2] | 0;
    a[(d + 7) >> 0] = h >>> 24;
    a[(d + 6) >> 0] = h >>> 16;
    a[(d + 5) >> 0] = h >>> 8;
    a[(d + 4) >> 0] = h;
    h = c[(g + 8) >> 2] | 0;
    a[(d + 11) >> 0] = h >>> 24;
    a[(d + 10) >> 0] = h >>> 16;
    a[(d + 9) >> 0] = h >>> 8;
    a[(d + 8) >> 0] = h;
    h = c[(g + 12) >> 2] | 0;
    a[(d + 13) >> 0] = (h & 65535) >>> 8;
    a[(d + 12) >> 0] = h;
    a[(d + 14) >> 0] = h >>> 16;
    a[(d + 15) >> 0] = h >>> 24;
    g = c[(g + 16) >> 2] | 0;
    a[(d + 16) >> 0] = g;
    a[(d + 17) >> 0] = (g & 65535) >>> 8;
    a[(d + 19) >> 0] = g >>> 24;
    a[(d + 18) >> 0] = g >>> 16;
    d = (f + 4784) | 0;
    if (!(a[d >> 0] | 0)) {
      i = e;
      return;
    }
    h = ((Wf(c[b >> 2] | 0) | 0) & 255) << 24;
    h = (((Wf(c[b >> 2] | 0) | 0) & 255) << 16) | h;
    h = h | (((Wf(c[b >> 2] | 0) | 0) & 255) << 8);
    c[(b + 4) >> 2] = h | ((Wf(c[b >> 2] | 0) | 0) & 255);
    a[d >> 0] = 0;
    i = e;
    return;
  }
  function xg(a) {
    a = a | 0;
    var b = 0;
    b = i;
    c[a >> 2] = 8504;
    a = c[(a + 8) >> 2] | 0;
    if (!a) {
      i = b;
      return;
    }
    Jf(a);
    Uq(a);
    i = b;
    return;
  }
  function yg(a) {
    a = a | 0;
    var b = 0,
      d = 0;
    b = i;
    c[a >> 2] = 8504;
    d = c[(a + 8) >> 2] | 0;
    if (!d) {
      Uq(a);
      i = b;
      return;
    }
    Jf(d);
    Uq(d);
    Uq(a);
    i = b;
    return;
  }
  function zg(a) {
    a = a | 0;
    return;
  }
  function Ag(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function Bg(a) {
    a = a | 0;
    var b = 0;
    b = i;
    a = c[(a + 12) >> 2] | 0;
    if (!a) {
      i = b;
      return;
    }
    jd[c[((c[a >> 2] | 0) + 8) >> 2] & 255](a);
    i = b;
    return;
  }
  function Cg(a, b) {
    a = a | 0;
    b = b | 0;
    if ((c[(b + 4) >> 2] | 0) == 9112) a = (a + 12) | 0;
    else a = 0;
    return a | 0;
  }
  function Dg(a) {
    a = a | 0;
    var b = 0;
    b = i;
    Uq(a);
    i = b;
    return;
  }
  function Eg(b) {
    b = b | 0;
    var d = 0,
      e = 0,
      f = 0,
      g = 0;
    d = i;
    c[b >> 2] = 9396;
    c[(b + 64) >> 2] = 9436;
    c[(b + 8) >> 2] = 9416;
    e = (b + 12) | 0;
    c[e >> 2] = 9584;
    if (a[(b + 44) >> 0] & 1) Uq(c[(b + 52) >> 2] | 0);
    c[e >> 2] = 16248;
    e = c[(b + 16) >> 2] | 0;
    g = (e + 4) | 0;
    f = c[g >> 2] | 0;
    c[g >> 2] = f + -1;
    if (f) {
      g = (b + 64) | 0;
      _i(g);
      i = d;
      return;
    }
    jd[c[((c[e >> 2] | 0) + 8) >> 2] & 255](e);
    g = (b + 64) | 0;
    _i(g);
    i = d;
    return;
  }
  function Fg(b) {
    b = b | 0;
    var d = 0,
      e = 0,
      f = 0,
      g = 0;
    d = i;
    f = (b + -8) | 0;
    c[f >> 2] = 9396;
    b = (f + 64) | 0;
    c[b >> 2] = 9436;
    c[(f + 8) >> 2] = 9416;
    e = (f + 12) | 0;
    c[e >> 2] = 9584;
    if (a[(f + 44) >> 0] & 1) Uq(c[(f + 52) >> 2] | 0);
    c[e >> 2] = 16248;
    e = c[(f + 16) >> 2] | 0;
    g = (e + 4) | 0;
    f = c[g >> 2] | 0;
    c[g >> 2] = f + -1;
    if (f) {
      _i(b);
      i = d;
      return;
    }
    jd[c[((c[e >> 2] | 0) + 8) >> 2] & 255](e);
    _i(b);
    i = d;
    return;
  }
  function Gg(b) {
    b = b | 0;
    var d = 0,
      e = 0,
      f = 0,
      g = 0;
    e = i;
    g = c[((c[b >> 2] | 0) + -12) >> 2] | 0;
    c[(b + g) >> 2] = 9396;
    d = (b + (g + 64)) | 0;
    c[d >> 2] = 9436;
    c[(b + (g + 8)) >> 2] = 9416;
    f = (b + (g + 12)) | 0;
    c[f >> 2] = 9584;
    if (a[(b + (g + 44)) >> 0] & 1) Uq(c[(b + (g + 52)) >> 2] | 0);
    c[f >> 2] = 16248;
    b = c[(b + (g + 16)) >> 2] | 0;
    f = (b + 4) | 0;
    g = c[f >> 2] | 0;
    c[f >> 2] = g + -1;
    if (g) {
      _i(d);
      i = e;
      return;
    }
    jd[c[((c[b >> 2] | 0) + 8) >> 2] & 255](b);
    _i(d);
    i = e;
    return;
  }
  function Hg(b) {
    b = b | 0;
    var d = 0,
      e = 0,
      f = 0,
      g = 0;
    d = i;
    c[b >> 2] = 9396;
    c[(b + 64) >> 2] = 9436;
    c[(b + 8) >> 2] = 9416;
    e = (b + 12) | 0;
    c[e >> 2] = 9584;
    if (a[(b + 44) >> 0] & 1) Uq(c[(b + 52) >> 2] | 0);
    c[e >> 2] = 16248;
    e = c[(b + 16) >> 2] | 0;
    g = (e + 4) | 0;
    f = c[g >> 2] | 0;
    c[g >> 2] = f + -1;
    if (f) {
      g = (b + 64) | 0;
      _i(g);
      Uq(b);
      i = d;
      return;
    }
    jd[c[((c[e >> 2] | 0) + 8) >> 2] & 255](e);
    g = (b + 64) | 0;
    _i(g);
    Uq(b);
    i = d;
    return;
  }
  function Ig(b) {
    b = b | 0;
    var d = 0,
      e = 0,
      f = 0,
      g = 0,
      h = 0;
    d = i;
    e = (b + -8) | 0;
    c[e >> 2] = 9396;
    b = (e + 64) | 0;
    c[b >> 2] = 9436;
    c[(e + 8) >> 2] = 9416;
    f = (e + 12) | 0;
    c[f >> 2] = 9584;
    if (a[(e + 44) >> 0] & 1) Uq(c[(e + 52) >> 2] | 0);
    c[f >> 2] = 16248;
    f = c[(e + 16) >> 2] | 0;
    h = (f + 4) | 0;
    g = c[h >> 2] | 0;
    c[h >> 2] = g + -1;
    if (g) {
      _i(b);
      Uq(e);
      i = d;
      return;
    }
    jd[c[((c[f >> 2] | 0) + 8) >> 2] & 255](f);
    _i(b);
    Uq(e);
    i = d;
    return;
  }
  function Jg(b) {
    b = b | 0;
    var d = 0,
      e = 0,
      f = 0,
      g = 0,
      h = 0;
    f = i;
    h = c[((c[b >> 2] | 0) + -12) >> 2] | 0;
    e = (b + h) | 0;
    c[e >> 2] = 9396;
    d = (b + (h + 64)) | 0;
    c[d >> 2] = 9436;
    c[(b + (h + 8)) >> 2] = 9416;
    g = (b + (h + 12)) | 0;
    c[g >> 2] = 9584;
    if (a[(b + (h + 44)) >> 0] & 1) Uq(c[(b + (h + 52)) >> 2] | 0);
    c[g >> 2] = 16248;
    b = c[(b + (h + 16)) >> 2] | 0;
    g = (b + 4) | 0;
    h = c[g >> 2] | 0;
    c[g >> 2] = h + -1;
    if (h) {
      _i(d);
      Uq(e);
      i = f;
      return;
    }
    jd[c[((c[b >> 2] | 0) + 8) >> 2] & 255](b);
    _i(d);
    Uq(e);
    i = f;
    return;
  }
  function Kg(b) {
    b = b | 0;
    var d = 0,
      e = 0,
      f = 0;
    d = i;
    c[b >> 2] = 9584;
    if (a[(b + 32) >> 0] & 1) Uq(c[(b + 40) >> 2] | 0);
    c[b >> 2] = 16248;
    b = c[(b + 4) >> 2] | 0;
    f = (b + 4) | 0;
    e = c[f >> 2] | 0;
    c[f >> 2] = e + -1;
    if (e) {
      i = d;
      return;
    }
    jd[c[((c[b >> 2] | 0) + 8) >> 2] & 255](b);
    i = d;
    return;
  }
  function Lg(b) {
    b = b | 0;
    var d = 0,
      e = 0,
      f = 0,
      g = 0;
    d = i;
    c[b >> 2] = 9584;
    if (a[(b + 32) >> 0] & 1) Uq(c[(b + 40) >> 2] | 0);
    c[b >> 2] = 16248;
    e = c[(b + 4) >> 2] | 0;
    g = (e + 4) | 0;
    f = c[g >> 2] | 0;
    c[g >> 2] = f + -1;
    if (f) {
      Uq(b);
      i = d;
      return;
    }
    jd[c[((c[e >> 2] | 0) + 8) >> 2] & 255](e);
    Uq(b);
    i = d;
    return;
  }
  function Mg(b, d, e, f, g, h) {
    b = b | 0;
    d = d | 0;
    e = e | 0;
    f = f | 0;
    g = g | 0;
    h = h | 0;
    var j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0;
    l = i;
    o = (d + 44) | 0;
    m = c[o >> 2] | 0;
    k = (d + 24) | 0;
    j = c[k >> 2] | 0;
    if (m >>> 0 < j >>> 0) {
      c[o >> 2] = j;
      m = j;
    }
    o = h & 24;
    do
      if (!o) {
        o = b;
        c[o >> 2] = 0;
        c[(o + 4) >> 2] = 0;
        o = (b + 8) | 0;
        c[o >> 2] = -1;
        c[(o + 4) >> 2] = -1;
        i = l;
        return;
      } else if ((o | 0) != 24) {
        if (!g) {
          g = 0;
          o = 0;
          break;
        } else if ((g | 0) == 2) {
          n = 11;
          break;
        } else if ((g | 0) != 1) {
          n = 15;
          break;
        }
        if (!(h & 8)) {
          o = (j - (c[(d + 20) >> 2] | 0)) | 0;
          g = o;
          o = (((o | 0) < 0) << 31) >> 31;
          break;
        } else {
          o = ((c[(d + 12) >> 2] | 0) - (c[(d + 8) >> 2] | 0)) | 0;
          g = o;
          o = (((o | 0) < 0) << 31) >> 31;
          break;
        }
      } else {
        if (!g) {
          g = 0;
          o = 0;
          break;
        } else if ((g | 0) == 2) {
          n = 11;
          break;
        } else if ((g | 0) != 1) {
          n = 15;
          break;
        }
        o = b;
        c[o >> 2] = 0;
        c[(o + 4) >> 2] = 0;
        o = (b + 8) | 0;
        c[o >> 2] = -1;
        c[(o + 4) >> 2] = -1;
        i = l;
        return;
      }
    while (0);
    if ((n | 0) == 15) {
      o = b;
      c[o >> 2] = 0;
      c[(o + 4) >> 2] = 0;
      o = (b + 8) | 0;
      c[o >> 2] = -1;
      c[(o + 4) >> 2] = -1;
      i = l;
      return;
    }
    if ((n | 0) == 11) {
      n = (d + 32) | 0;
      if (!(a[n >> 0] & 1)) n = (n + 1) | 0;
      else n = c[(d + 40) >> 2] | 0;
      o = (m - n) | 0;
      g = o;
      o = (((o | 0) < 0) << 31) >> 31;
    }
    f = kr(g | 0, o | 0, e | 0, f | 0) | 0;
    e = H;
    if ((e | 0) >= 0) {
      n = (d + 32) | 0;
      if (!(a[n >> 0] & 1)) n = (n + 1) | 0;
      else n = c[(d + 40) >> 2] | 0;
      o = (m - n) | 0;
      g = (((o | 0) < 0) << 31) >> 31;
      if (!(((g | 0) < (e | 0)) | (((g | 0) == (e | 0)) & (o >>> 0 < f >>> 0)))) {
        n = h & 8;
        if (!(((f | 0) == 0) & ((e | 0) == 0))) {
          if ((n | 0) != 0 ? (c[(d + 12) >> 2] | 0) == 0 : 0) {
            o = b;
            c[o >> 2] = 0;
            c[(o + 4) >> 2] = 0;
            o = (b + 8) | 0;
            c[o >> 2] = -1;
            c[(o + 4) >> 2] = -1;
            i = l;
            return;
          }
          if ((((h & 16) | 0) != 0) & ((j | 0) == 0)) {
            o = b;
            c[o >> 2] = 0;
            c[(o + 4) >> 2] = 0;
            o = (b + 8) | 0;
            c[o >> 2] = -1;
            c[(o + 4) >> 2] = -1;
            i = l;
            return;
          }
        }
        if (n) {
          c[(d + 12) >> 2] = (c[(d + 8) >> 2] | 0) + f;
          c[(d + 16) >> 2] = m;
        }
        if (h & 16) c[k >> 2] = (c[(d + 20) >> 2] | 0) + f;
        o = b;
        c[o >> 2] = 0;
        c[(o + 4) >> 2] = 0;
        o = (b + 8) | 0;
        c[o >> 2] = f;
        c[(o + 4) >> 2] = e;
        i = l;
        return;
      }
    }
    o = b;
    c[o >> 2] = 0;
    c[(o + 4) >> 2] = 0;
    o = (b + 8) | 0;
    c[o >> 2] = -1;
    c[(o + 4) >> 2] = -1;
    i = l;
    return;
  }
  function Ng(a, b, d, e) {
    a = a | 0;
    b = b | 0;
    d = d | 0;
    e = e | 0;
    var f = 0;
    f = i;
    d = (d + 8) | 0;
    ud[c[((c[b >> 2] | 0) + 16) >> 2] & 31](a, b, c[d >> 2] | 0, c[(d + 4) >> 2] | 0, 0, e);
    i = f;
    return;
  }
  function Og(a) {
    a = a | 0;
    var b = 0,
      e = 0,
      f = 0,
      g = 0;
    b = i;
    f = (a + 44) | 0;
    g = c[f >> 2] | 0;
    e = c[(a + 24) >> 2] | 0;
    if (g >>> 0 < e >>> 0) c[f >> 2] = e;
    else e = g;
    if (!(c[(a + 48) >> 2] & 8)) {
      g = -1;
      i = b;
      return g | 0;
    }
    f = (a + 16) | 0;
    g = c[f >> 2] | 0;
    a = c[(a + 12) >> 2] | 0;
    if (g >>> 0 < e >>> 0) c[f >> 2] = e;
    else e = g;
    if (a >>> 0 >= e >>> 0) {
      g = -1;
      i = b;
      return g | 0;
    }
    g = d[a >> 0] | 0;
    i = b;
    return g | 0;
  }
  function Pg(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0;
    e = i;
    g = (b + 44) | 0;
    f = c[g >> 2] | 0;
    j = c[(b + 24) >> 2] | 0;
    if (f >>> 0 < j >>> 0) c[g >> 2] = j;
    else j = f;
    f = (b + 8) | 0;
    g = c[f >> 2] | 0;
    h = (b + 12) | 0;
    l = c[h >> 2] | 0;
    if (g >>> 0 >= l >>> 0) {
      l = -1;
      i = e;
      return l | 0;
    }
    if ((d | 0) == -1) {
      c[f >> 2] = g;
      c[h >> 2] = l + -1;
      c[(b + 16) >> 2] = j;
      l = 0;
      i = e;
      return l | 0;
    }
    if (!(c[(b + 48) >> 2] & 16)) {
      k = d & 255;
      l = (l + -1) | 0;
      if ((k << 24) >> 24 != (a[l >> 0] | 0)) {
        l = -1;
        i = e;
        return l | 0;
      }
    } else {
      k = d & 255;
      l = (l + -1) | 0;
    }
    c[f >> 2] = g;
    c[h >> 2] = l;
    c[(b + 16) >> 2] = j;
    a[l >> 0] = k;
    l = d;
    i = e;
    return l | 0;
  }
  function Qg(b, d) {
    b = b | 0;
    d = d | 0;
    var e = 0,
      f = 0,
      g = 0,
      h = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
      q = 0,
      r = 0,
      s = 0,
      t = 0,
      u = 0;
    e = i;
    if ((d | 0) == -1) {
      u = 0;
      i = e;
      return u | 0;
    }
    h = (b + 12) | 0;
    f = (b + 8) | 0;
    g = ((c[h >> 2] | 0) - (c[f >> 2] | 0)) | 0;
    j = (b + 24) | 0;
    o = c[j >> 2] | 0;
    k = (b + 28) | 0;
    n = c[k >> 2] | 0;
    if ((o | 0) == (n | 0)) {
      l = (b + 48) | 0;
