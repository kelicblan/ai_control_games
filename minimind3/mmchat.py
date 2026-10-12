# -*- coding: utf-8 -*-
"""
MiniMind-3 64M (Q8 GGUF) 纯进程内推理 —— ctypes 直接调用 Ollama 自带的 llama.dll
不使用任何网络套接字，绕开安全软件对未知 exe 入站连接的拦截。
对应 llama.cpp 头文件: llama.h @ commit 631109b34
"""
import os
import sys
import ctypes
import codecs
import secrets
import time
from ctypes import (
    c_void_p, c_char_p, c_int32, c_uint32, c_size_t, c_float, c_bool, c_int8,
    POINTER, Structure, CDLL, byref,
)

BASE = os.path.dirname(os.path.abspath(__file__))
LIB_DIR = os.path.join(BASE, "ollama", "lib", "ollama")
MODEL_PATH = os.path.join(BASE, "model", "minimind-3.q8.gguf")

# ---------------------------------------------------------------- 结构体定义
class llama_model_params(Structure):
    _fields_ = [
        ("devices", c_void_p),
        ("tensor_buft_overrides", c_void_p),
        ("n_gpu_layers", c_int32),
        ("split_mode", c_int32),
        ("load_mode", c_int32),
        ("lazy_mode", c_int32),
        ("main_gpu", c_int32),
        ("tensor_split", POINTER(c_float)),
        ("progress_callback", c_void_p),
        ("progress_callback_user_data", c_void_p),
        ("kv_overrides", c_void_p),
        ("vocab_only", c_bool),
        ("check_tensors", c_bool),
        ("use_extra_bufts", c_bool),
        ("no_host", c_bool),
        ("no_alloc", c_bool),
        ("load_mtp", c_bool),
    ]

class llama_context_params(Structure):
    _fields_ = [
        ("n_ctx", c_uint32),
        ("n_batch", c_uint32),
        ("n_ubatch", c_uint32),
        ("n_seq_max", c_uint32),
        ("n_rs_seq", c_uint32),
        ("n_outputs_max", c_uint32),
        ("n_outputs_max_per_seq", c_uint32),
        ("n_threads", c_int32),
        ("n_threads_batch", c_int32),
        ("ctx_type", c_int32),
        ("rope_scaling_type", c_int32),
        ("pooling_type", c_int32),
        ("attention_type", c_int32),
        ("flash_attn_type", c_int32),
        ("rope_freq_base", c_float),
        ("rope_freq_scale", c_float),
        ("yarn_ext_factor", c_float),
        ("yarn_attn_factor", c_float),
        ("yarn_beta_fast", c_float),
        ("yarn_beta_slow", c_float),
        ("yarn_orig_ctx", c_uint32),
        ("defrag_thold", c_float),
        ("cb_eval", c_void_p),
        ("cb_eval_user_data", c_void_p),
        ("type_k", c_int32),
        ("type_v", c_int32),
        ("abort_callback", c_void_p),
        ("abort_callback_data", c_void_p),
        ("embeddings", c_bool),
        ("offload_kqv", c_bool),
        ("no_perf", c_bool),
        ("op_offload", c_bool),
        ("swa_full", c_bool),
        ("kv_unified", c_bool),
        ("samplers", c_void_p),
        ("n_samplers", c_size_t),
        ("ctx_other", c_void_p),
    ]

class llama_sampler_chain_params(Structure):
    _fields_ = [("no_perf", c_bool)]

class llama_batch(Structure):
    _fields_ = [
        ("n_tokens", c_int32),
        ("token", POINTER(c_int32)),
        ("embd", POINTER(c_float)),
        ("pos", POINTER(c_int32)),
        ("n_seq_id", POINTER(c_int32)),
        ("seq_id", POINTER(POINTER(c_int32))),
        ("logits", POINTER(c_int8)),
    ]

# ---------------------------------------------------------------- 加载 DLL
os.add_dll_directory(LIB_DIR)
os.environ["PATH"] = LIB_DIR + os.pathsep + os.environ.get("PATH", "")
ll = CDLL(os.path.join(LIB_DIR, "libllama.dll"))

# Keep native warnings/errors, omit per-graph debug dumps in a resident service.
_log_callback_type = ctypes.CFUNCTYPE(None, c_int32, c_char_p, c_void_p)
@_log_callback_type
def _native_log(level, message, _user_data):
    if level >= 3 and message:
        sys.stderr.write(message.decode('utf-8', errors='replace'))
ll.llama_log_set.argtypes = [_log_callback_type, c_void_p]
ll.llama_log_set(_native_log, None)

# 动态加载 ggml 计算后端（ggml-cpu-*.dll 等在运行时才发现）
gg = CDLL(os.path.join(LIB_DIR, "ggml.dll"))
gg.ggml_backend_load_all.argtypes = []
gg.ggml_backend_load_all.restype = None
gg.ggml_backend_load_all()
n_devs = ctypes.c_int32(0)
try:
    gg.ggml_backend_reg_count.argtypes = []
    gg.ggml_backend_reg_count.restype = c_int32
    print("[init] registered backends:", gg.ggml_backend_reg_count(), flush=True)
except AttributeError:
    pass
if gg.ggml_backend_reg_count() == 0:
    # exe 目录下没有 ggml-*.dll，显式按路径加载
    gg.ggml_backend_load_all_from_path.argtypes = [c_char_p]
    gg.ggml_backend_load_all_from_path.restype = None
    gg.ggml_backend_load_all_from_path(LIB_DIR.encode("utf-8"))
    print("[init] backends after explicit path load:", gg.ggml_backend_reg_count(), flush=True)

ll.llama_backend_init.argtypes = []
ll.llama_backend_init.restype = None

ll.llama_model_default_params.argtypes = []
ll.llama_model_default_params.restype = llama_model_params
ll.llama_model_load_from_file.argtypes = [c_char_p, llama_model_params]
ll.llama_model_load_from_file.restype = c_void_p
ll.llama_model_free.argtypes = [c_void_p]
ll.llama_model_get_vocab.argtypes = [c_void_p]
ll.llama_model_get_vocab.restype = c_void_p

ll.llama_context_default_params.argtypes = []
ll.llama_context_default_params.restype = llama_context_params
ll.llama_init_from_model.argtypes = [c_void_p, llama_context_params]
ll.llama_init_from_model.restype = c_void_p
ll.llama_free.argtypes = [c_void_p]
ll.llama_get_memory.argtypes = [c_void_p]
ll.llama_get_memory.restype = c_void_p
ll.llama_memory_clear.argtypes = [c_void_p, c_bool]
ll.llama_memory_clear.restype = None
ll.llama_vocab_is_eog.argtypes = [c_void_p, c_int32]
ll.llama_vocab_is_eog.restype = c_bool

ll.llama_vocab_eos.argtypes = [c_void_p]
ll.llama_vocab_eos.restype = c_int32
ll.llama_tokenize.argtypes = [
    c_void_p, c_char_p, c_int32, POINTER(c_int32), c_int32, c_bool, c_bool,
]
ll.llama_tokenize.restype = c_int32
ll.llama_token_to_piece.argtypes = [
    c_void_p, c_int32, c_char_p, c_int32, c_int32, c_bool,
]
ll.llama_token_to_piece.restype = c_int32

ll.llama_batch_get_one.argtypes = [
    POINTER(c_int32), c_int32,
]
ll.llama_batch_get_one.restype = llama_batch
ll.llama_decode.argtypes = [c_void_p, llama_batch]
ll.llama_decode.restype = c_int32

ll.llama_sampler_chain_default_params.argtypes = []
ll.llama_sampler_chain_default_params.restype = llama_sampler_chain_params
ll.llama_sampler_chain_init.argtypes = [llama_sampler_chain_params]
ll.llama_sampler_chain_init.restype = c_void_p
ll.llama_sampler_chain_add.argtypes = [c_void_p, c_void_p]
ll.llama_sampler_chain_add.restype = None
ll.llama_sampler_init_top_k.argtypes = [c_int32]
ll.llama_sampler_init_top_k.restype = c_void_p
ll.llama_sampler_init_top_p.argtypes = [c_float, c_size_t]
ll.llama_sampler_init_top_p.restype = c_void_p
ll.llama_sampler_init_temp.argtypes = [c_float]
ll.llama_sampler_init_temp.restype = c_void_p
ll.llama_sampler_init_dist.argtypes = [c_uint32]
ll.llama_sampler_init_dist.restype = c_void_p
ll.llama_sampler_free.argtypes = [c_void_p]
ll.llama_sampler_sample.argtypes = [c_void_p, c_void_p, c_int32]
ll.llama_sampler_sample.restype = c_int32

# ---------------------------------------------------------------- 初始化
print("[init] backend ...", flush=True)
ll.llama_backend_init()

print("[init] loading model:", os.path.basename(MODEL_PATH), flush=True)
mp = ll.llama_model_default_params()
model = ll.llama_model_load_from_file(MODEL_PATH.encode("utf-8"), mp)
if not model:
    sys.exit("model load failed")
vocab = ll.llama_model_get_vocab(model)
eos = ll.llama_vocab_eos(vocab)
print(f"[init] model ok, eos_token={eos}", flush=True)

cp = ll.llama_context_default_params()
print(f"[init] defaults: n_ctx={cp.n_ctx} n_threads={cp.n_threads} n_seq_max={cp.n_seq_max}", flush=True)
cp.n_ctx, cp.n_batch, cp.n_ubatch, cp.n_seq_max = 2048, 512, 512, 1
N_THREADS = min(8, os.cpu_count() or 4)
cp.n_threads, cp.n_threads_batch = N_THREADS, N_THREADS
ctx = ll.llama_init_from_model(model, cp)
if not ctx:
    sys.exit("context init failed")
print(f"[init] context ok (threads={N_THREADS})", flush=True)


def tokenize(text, add_special):
    buf = (c_int32 * 2048)()
    raw = text.encode("utf-8")
    # 注意: 此构建 text_len=-1(strlen) 路径会触发内部 abort, 必须显式传字节长度
    n = ll.llama_tokenize(
        vocab, raw, len(raw), buf, 2048, add_special, True
    )
    if n <= 0:
        raise ValueError('Prompt is empty or exceeds the 2048-token buffer')
    return list(buf[:n])


def piece_bytes(tok):
    b = ctypes.create_string_buffer(256)
    n = ll.llama_token_to_piece(vocab, tok, b, 256, 0, True)
    if n <= 0:
        return b""
    return b.raw[:n]


def make_sampler(temp=0.8, top_k=40, top_p=0.9, seed=None):
    if seed is None:
        seed = secrets.randbits(32)
    sc = ll.llama_sampler_chain_default_params()
    chain = ll.llama_sampler_chain_init(sc)
    for init in (
        lambda: ll.llama_sampler_init_top_k(top_k),
        lambda: ll.llama_sampler_init_top_p(top_p, 1),
        lambda: ll.llama_sampler_init_temp(temp),
        lambda: ll.llama_sampler_init_dist(seed),
    ):
        s = init()
        if s:
            ll.llama_sampler_chain_add(chain, s)
    return chain


def reset_context():
    ll.llama_memory_clear(ll.llama_get_memory(ctx), True)


class Chat:
    """One global native context: callers MUST serialize all Chat use."""
    def __init__(self, system="你是一个乐于助人的AI助手。", deadline=None):
        # MiniMind3 使用 Qwen 风格 ChatML 模板
        self.pos = 0
        self.history = ""
        self.deadline = deadline
        self.reset()
        if system:
            self._feed(tokenize(
                f"<|im_start|>system\n{system}<|im_end|>\n", add_special=False
            ))

    def reset(self):
        reset_context()
        self.pos = 0
        self.history = ""

    def _check_deadline(self):
        if self.deadline is not None and time.monotonic() >= self.deadline:
            raise TimeoutError('MiniMind generation deadline exceeded')

    def _feed(self, toks):
        if self.pos + len(toks) >= cp.n_ctx:
            raise ValueError('MiniMind context full; start a new bounded conversation')
        for offset in range(0, len(toks), 128):
            self._check_deadline()
            chunk = toks[offset:offset + 128]
            arr = (c_int32 * len(chunk))(*chunk)
            batch = ll.llama_batch_get_one(arr, len(chunk))
            r = ll.llama_decode(ctx, batch)
            if r != 0:
                raise RuntimeError(f"llama_decode failed: {r}")
            self.pos += len(chunk)

    def ask(self, question, max_new_tokens=256, verbose=True, *, seed=None,
            temperature=.8, no_thinking=False, stop_at_sentence=False, assistant_prefix=''):
        delta = (
            f"<|im_start|>user\n{question}<|im_end|>\n"
            f"<|im_start|>assistant\n"
        )
        if no_thinking:
            delta += '<think>\n\n</think>\n\n'
        delta += assistant_prefix
        self._feed(tokenize(delta, add_special=False))
        chain = make_sampler(temp=temperature, seed=seed)
        out, steps = [assistant_prefix], 0
        decoder = codecs.getincrementaldecoder('utf-8')(errors='replace')
        try:
            while steps < max_new_tokens:
                self._check_deadline()
                tok = ll.llama_sampler_sample(chain, ctx, -1)
                if ll.llama_vocab_is_eog(vocab, tok):
                    break
                p = decoder.decode(piece_bytes(tok))
                out.append(p)
                steps += 1
                if verbose:
                    print(p, end="", flush=True)
                if "<|im_" in p or "<|im_" in p.replace("\n", ""):
                    break
                self._feed([tok])
                visible = ''.join(out)
                thinking = visible.rfind('<think>') > visible.rfind('</think>')
                if stop_at_sentence and not thinking and len(visible) >= 4 and any(mark in p for mark in '。！？!?'):
                    break
        finally:
            ll.llama_sampler_free(chain)
        if verbose:
            print(flush=True)
        answer = "".join(out)
        for marker in ("<|im_start|>", "<|im_end|>", "<|im_"):
            answer = answer.split(marker)[0]
        self.history += delta + answer + "<|im_end|>\n"
        return answer


if __name__ == "__main__":
    chat = Chat()
    if len(sys.argv) > 1:
        t = Chat.ask.__defaults__
        for q in sys.argv[1:]:
            print(f"\n<Q> {q}\n<A> ", flush=True)
            chat.ask(q)
        sys.exit(0)
    print("进入交互模式（输入 exit 退出）", flush=True)
    while True:
        try:
            q = input("\n<Q> ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not q or q.lower() in ("exit", "quit", "q"):
            break
        print("<A> ", end="", flush=True)
        chat.ask(q)
    print("\nbye", flush=True)
