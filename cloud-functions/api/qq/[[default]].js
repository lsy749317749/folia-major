// src/protocol/businessCodes.ts
//
// 上游数字码的登记表：哪一步调用、哪一层、哪个数字、什么意思、凭什么这样说。
//
// 同一个数字在不同调用、不同层可以完全不同义（例如 104400 在带凭证的读取里表示凭证失效，
// 在歌手接口的内层却只是参数不对），所以查表一定要同时给出调用和层级，只给数字查不到任何东西。
// 没有「对所有调用都成立」的条目；没登记的组合一律当成未知，不推断。零依赖，两个运行时共用。
/** 哪一步上游调用。扫码登录按通道分开：两个通道的同名步骤背后不是同一次请求。 */
const entries = (operations, sourceLayer, codes, body) => operations.flatMap((operation) => codes.map((upstreamCode) => ({ operation, sourceLayer, upstreamCode, ...body })));
/** 两个通道换凭证用的是同一个上游方法，刷新凭证也是；登录码只在这几步有意思。 */
const LOGIN_EXCHANGE = [
    'login.qq.credential-exchange',
    'login.wechat.credential-exchange',
    'login.wechat.credential-refresh',
];
/** 带凭证读取时，上游用这几个码表示凭证不被认可。 */
const CREDENTIAL_CODES = [1000, 104400, 104401];
const credentialRejected = (operations, note) => entries(operations, 'business', CREDENTIAL_CODES, {
    kind: 'credential-invalid',
    errorKey: 'auth.credential-invalid',
    evidence: 'existing-behavior',
    note,
    suggestedAction: 'sign-in-again',
    invalidatesSession: true,
});
const observedUnknown = (note) => ({
    kind: 'upstream-business',
    errorKey: 'upstream.unknown',
    evidence: 'observed-response',
    note,
});
const UPSTREAM_CODES = [
    ...entries(LOGIN_EXCHANGE, 'business', [20279], {
        kind: 'device-limit',
        errorKey: 'auth.device-limit',
        evidence: 'protocol-reference',
        note: '公开协议资料：登录设备数已达上限。社区回报里多次出现在手机 QQ 扫码的换凭证步骤；本项目未做受控复现',
        suggestedAction: 'manage-login-devices',
        invalidatesSession: false,
    }),
    ...entries(LOGIN_EXCHANGE, 'business', [20277, 20278], {
        kind: 'account-restricted',
        errorKey: 'auth.account-restricted',
        evidence: 'protocol-reference',
        note: '公开协议资料：账号受限；本项目未实测',
        invalidatesSession: false,
    }),
    ...entries(LOGIN_EXCHANGE, 'business', [20450], {
        kind: 'account-banned',
        errorKey: 'auth.account-banned',
        evidence: 'protocol-reference',
        note: '公开协议资料：账号被封禁；本项目未实测',
        invalidatesSession: false,
    }),
    ...entries(LOGIN_EXCHANGE, 'business', [20272, 20274], {
        kind: 'account-binding',
        errorKey: 'auth.account-binding',
        evidence: 'protocol-reference',
        note: '公开协议资料：账号绑定异常（20272）或缺失（20274）；本项目未实测',
        invalidatesSession: false,
    }),
    ...entries(LOGIN_EXCHANGE, 'business', [20261], {
        kind: 'login-rejected',
        errorKey: 'auth.login-rejected',
        evidence: 'protocol-reference',
        note: '公开协议资料：登录参数不被接受；本项目未实测，只说「被拒」不说原因',
        invalidatesSession: false,
    }),
    ...entries(LOGIN_EXCHANGE, 'business', [104604], {
        kind: 'rate-limited',
        errorKey: 'auth.rate-limited',
        evidence: 'protocol-reference',
        note: '公开协议资料：登录操作过于频繁；本项目未实测。扫码冷却遇到它是 30 秒（其他失败 15 秒）',
        suggestedAction: 'wait',
        invalidatesSession: false,
    }),
    ...entries(['login.qq.credential-exchange'], 'business', [50006], observedUnknown('本项目实测见过（手机 QQ 扫码换凭证被拒），原因未知；不能当成设备超限')),
    ...entries(['login.qq.fallback-validation'], 'business', [1000], observedUnknown('本项目实测见过：换凭证失败后改用扫码票据读登录用户也被拒。它盖住了换凭证那一步的真实原因，不能当成会话失效或设备超限')),
    ...credentialRejected(['session.authenticated-read'], '本项目一直以来的处理：带凭证的 musicu 读取在单项这一层回这几个码，表示凭证不被认可，路由回 401'),
    ...credentialRejected(['recommend.guess-you-like', 'recommend.playlists'], '推荐路由一上线就这样处理：会话解得开但上游不认凭证时回 401，让前端清掉坏会话；猜你喜欢不带凭证时实测回 1000'),
    ...credentialRejected(['recommend.daily-songs'], '每日 30 首要登录，照电台路由处理：会话解得开但上游不认凭证时回 401。这个接口没有单独实测过这几个码'),
    ...credentialRejected(['recommend.radio-list', 'recommend.radio-tracks'], '电台路由要登录，沿用其他带凭证读取的处理：会话解得开但上游不认凭证时回 401。这两个接口没有单独实测过这几个码'),
    ...entries(['search'], 'business', [2001], {
        ...observedUnknown('本项目实测见过：精简版搜索匿名搜歌曲时常回 2001（带会话的同一关键字有结果），原因没有分离。不能当成搜不到，也不自动重试'),
        errorKey: 'search.rejected',
    }),
    ...entries(['recommend.guess-you-like'], 'business', [22006], {
        ...observedUnknown('本项目实测见过（带 song_ids 且 num 改成 10 时被拒），原因没有分离'),
        errorKey: 'recommendation.rejected',
    }),
    ...entries(['recommend.web-daily-candidate'], 'business', [500003], observedUnknown('本项目实测见过（HTTP 200、网关码 0、单项码 500003），原因未知；不能推断成出口 IP 被拒')),
    ...entries(['recommend.web-daily-candidate'], 'business-subcode', [860100005], observedUnknown('本项目实测见过（与单项码 500003 一起出现），原因未知')),
    ...entries(['playlist.anonymous-detail'], 'business', [10], {
        ...observedUnknown('本项目实测：算法歌单用匿名接口读不到，要带凭证重读'),
        errorKey: 'playlist.anonymous-unreadable',
    }),
    ...entries(['playlist.authenticated-detail'], 'business', [10004], {
        kind: 'not-found',
        errorKey: 'playlist.not-found',
        evidence: 'observed-response',
        note: '本项目实测：带凭证读一个不存在的歌单',
    }),
    ...entries(['playlist.authenticated-detail'], 'business', [80120], {
        ...observedUnknown('本项目实测见过（不带登录时），还没确认是不是凭证失效，所以不回 401'),
        errorKey: 'playlist.authentication-unverified',
    }),
    ...entries(['playlist.add-songs', 'playlist.del-songs'], 'business', [80092], {
        kind: 'upstream-business',
        errorKey: 'playlist.already-applied',
        evidence: 'protocol-reference',
        note: '公开协议资料：歌曲已经在（或不在）歌单里；写入路由验证协议后才能放行成成功',
        disposition: 'idempotent-candidate',
    }),
    ...entries(['playlist.add-songs'], 'business', [80105], {
        kind: 'upstream-business',
        errorKey: 'playlist.write-rejected',
        evidence: 'third-party-report',
        note: '第三方回报：往「我喜欢」加歌被拒；参数还是权限问题未知',
    }),
    ...entries(['playlist.del-songs'], 'business', [2001], observedUnknown('网页实测见过：删歌单里的歌时单项码 2001、data.retCode 0。不能当成成功，也不能当成限流、自动重试或给冷却时间')),
    ...entries(['library.favorite-albums'], 'business', [80000, 40000], {
        ...observedUnknown('本项目实测：收藏专辑的 musicu 接口不可用，已改走旧 CGI'),
        errorKey: 'album.endpoint-unavailable',
    }),
    ...entries(['playback.authenticated-url'], 'song-entry', [104003], observedUnknown('本项目实测见过（免费账号，320 与 128 都有，subcode 1；有的歌 320 被拒、128 拿得到链接）。只表示这一个音质这一次没给链接，原因未分类')),
];
/** 查表：调用、层级、数字都对得上才有结果；拿到的是副本，改了也不影响登记表。 */
const lookupUpstreamCode = (operation, sourceLayer, upstreamCode) => {
    if (!Number.isSafeInteger(upstreamCode) || upstreamCode === 0)
        return undefined;
    const entry = UPSTREAM_CODES.find((candidate) => candidate.operation === operation &&
        candidate.sourceLayer === sourceLayer &&
        candidate.upstreamCode === upstreamCode);
    return entry ? { ...entry } : undefined;
};
/** 错误核心用来校验调用方给的 errorKey：只有登记表里同一类的 key 才收。 */
const isRegisteredErrorKey = (value, kind) => typeof value === 'string' &&
    UPSTREAM_CODES.some((entry) => entry.errorKey === value && entry.kind === kind);

// src/protocol/evidence.ts
//
// 一条错误码或分类规则「凭什么这样说」。零依赖，两个运行时共用。
const EVIDENCE_LEVELS = [
    'verified-controlled',
    'existing-behavior',
    'observed-response',
    'protocol-reference',
    'third-party-report',
    'unknown',
];
const isEvidenceLevel = (value) => typeof value === 'string' && EVIDENCE_LEVELS.includes(value);

const defaults = {
    input: { key: 'input.invalid', message: 'Invalid request', status: 400 },
    'auth-missing': { key: 'auth.required', message: 'Login required', status: 401 },
    'feature-unavailable': {
        key: 'feature.unavailable',
        message: 'Feature is not enabled',
        status: 501,
    },
    'credential-invalid': { key: 'auth.credential-invalid', message: 'Login required', status: 401 },
    'rate-limited': { key: 'upstream.rate-limited', message: 'Too many requests', status: 429 },
    network: { key: 'network.unknown', message: 'Network request failed', status: 502 },
    'upstream-http': { key: 'upstream.http', message: 'Upstream HTTP request failed', status: 502 },
    'upstream-gateway': {
        key: 'upstream.gateway-rejected',
        message: 'Upstream gateway rejected the request',
        status: 502,
    },
    'upstream-business': {
        key: 'upstream.unknown',
        message: 'Upstream rejected the request',
        status: 502,
    },
    'not-found': { key: 'resource.not-found', message: 'No matching data', status: 422 },
    'invalid-response': {
        key: 'upstream.invalid-response',
        message: 'Invalid upstream response',
        status: 502,
    },
    unexpected: { key: 'internal.unexpected', message: 'Service request failed', status: 500 },
    'device-limit': {
        key: 'auth.device-limit',
        message: 'Login was rejected; device policy may apply',
        status: 502,
    },
    'account-restricted': {
        key: 'auth.account-restricted',
        message: 'Upstream rejected this account login',
        status: 502,
    },
    'account-banned': {
        key: 'auth.account-banned',
        message: 'Upstream rejected this account login',
        status: 502,
    },
    'account-binding': {
        key: 'auth.account-binding',
        message: 'Upstream rejected this account login',
        status: 502,
    },
    'login-rejected': {
        key: 'auth.login-rejected',
        message: 'Upstream rejected this login',
        status: 502,
    },
};
const networkKeys = new Set([
    'network.dns',
    'network.refused',
    'network.reset',
    'network.timeout',
    'network.aborted',
    'network.unknown',
]);
const integerOf$1 = (value) => typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
const statusOf = (value) => {
    const status = integerOf$1(value);
    return status !== undefined && status >= 100 && status <= 599 ? status : undefined;
};
const delayOf = (value) => {
    const delay = integerOf$1(value);
    return delay !== undefined && delay >= 0 ? delay : undefined;
};
const propertyOf = (value, key) => {
    try {
        return value && typeof value === 'object' ? value[key] : undefined;
    }
    catch {
        return undefined;
    }
};
/** Contains only fixed messages, allowlisted keys and safe scalar observations, never native causes. */
class QqApiError extends Error {
    kind;
    errorKey;
    retryable;
    upstreamCode;
    upstreamGlobalCode;
    upstreamSubCode;
    upstreamHttpStatus;
    retryAfterMs;
    evidence;
    constructor(kind, options = {}) {
        const safeKind = Object.hasOwn(defaults, kind) ? kind : 'unexpected';
        super(defaults[safeKind].message);
        this.name = 'QqApiError';
        this.kind = safeKind;
        const key = options.errorKey;
        this.errorKey =
            key &&
                (key === defaults[safeKind].key ||
                    (safeKind === 'network' && networkKeys.has(key)) ||
                    isRegisteredErrorKey(key, safeKind))
                ? key
                : defaults[safeKind].key;
        this.retryable = options.retryable === true && ['network', 'upstream-http'].includes(safeKind);
        this.upstreamCode = integerOf$1(options.upstreamCode);
        this.upstreamGlobalCode = integerOf$1(options.upstreamGlobalCode);
        this.upstreamSubCode = integerOf$1(options.upstreamSubCode);
        this.upstreamHttpStatus = statusOf(options.upstreamHttpStatus);
        this.retryAfterMs = delayOf(options.retryAfterMs);
        this.evidence = isEvidenceLevel(options.evidence) ? options.evidence : undefined;
    }
    toJSON() {
        return {
            kind: this.kind,
            errorKey: this.errorKey,
            message: this.message,
            retryable: this.retryable,
            ...(this.upstreamCode === undefined ? {} : { upstreamCode: this.upstreamCode }),
            ...(this.upstreamGlobalCode === undefined
                ? {}
                : { upstreamGlobalCode: this.upstreamGlobalCode }),
            ...(this.upstreamSubCode === undefined ? {} : { upstreamSubCode: this.upstreamSubCode }),
            ...(this.upstreamHttpStatus === undefined
                ? {}
                : { upstreamHttpStatus: this.upstreamHttpStatus }),
            ...(this.retryAfterMs === undefined ? {} : { retryAfterMs: this.retryAfterMs }),
            ...(this.evidence === undefined ? {} : { evidence: this.evidence }),
        };
    }
}
const networkFailure = (raw, context) => {
    const name = propertyOf(raw, 'name');
    const directCode = propertyOf(raw, 'code');
    const code = directCode ?? propertyOf(propertyOf(raw, 'cause'), 'code');
    if (name === 'AbortError' ||
        name === 'CanceledError' ||
        code === 'ERR_CANCELED' ||
        code === 'ABORT_ERR')
        return new QqApiError('network', { errorKey: 'network.aborted' });
    const keys = {
        ENOTFOUND: 'network.dns',
        EAI_AGAIN: 'network.dns',
        ECONNREFUSED: 'network.refused',
        ECONNRESET: 'network.reset',
        ETIMEDOUT: 'network.timeout',
        ECONNABORTED: 'network.timeout',
    };
    const key = name === 'TimeoutError'
        ? 'network.timeout'
        : typeof code === 'string' && Object.hasOwn(keys, code)
            ? keys[code]
            : 'network.unknown';
    return new QqApiError('network', {
        errorKey: key,
        // A reset or timeout is not known to be a connection failure unless the transport says so.
        retryable: key !== 'network.unknown' && context.readOnly === true && context.networkPhase === 'connect',
    });
};
/** A number only has a meaning for the call and layer it was registered under; nothing applies globally. */
const registered$1 = (context, layer, code) => context.operation === undefined ? undefined : lookupUpstreamCode(context.operation, layer, code);
/** Used by new protocol/transport adapters. Existing route errors and status rules are untouched. */
const normalizeQqFailure = (failure, context = {}) => {
    if (failure.source === 'network')
        return networkFailure(failure.error, context);
    if (failure.source === 'input' ||
        failure.source === 'auth-missing' ||
        failure.source === 'invalid-response' ||
        failure.source === 'unexpected')
        return new QqApiError(failure.source);
    const details = failure;
    const http = statusOf(details.upstreamHttpStatus);
    // An HTTP failure wins over any body code. A 503 must never be treated as invalid credentials.
    if (http !== undefined && http >= 400)
        return new QqApiError(http === 429 ? 'rate-limited' : 'upstream-http', {
            ...details,
            retryable: context.readOnly === true && http >= 500,
        });
    if (failure.source === 'http')
        return new QqApiError('invalid-response', details);
    const global = integerOf$1(details.upstreamGlobalCode);
    if (global !== undefined && global !== 0) {
        const info = registered$1(context, 'gateway', global);
        return new QqApiError('upstream-gateway', { ...details, evidence: info?.evidence });
    }
    if (failure.source === 'gateway')
        return new QqApiError('invalid-response', details);
    const code = integerOf$1(details.upstreamCode);
    if (code === undefined || code === 0)
        return new QqApiError('invalid-response', details);
    const info = registered$1(context, 'business', code);
    return new QqApiError(info?.kind ?? 'upstream-business', {
        ...details,
        errorKey: info?.errorKey,
        evidence: info?.evidence,
    });
};
/** New routes only: never reinterpret the legacy 200-with-body-code or QR 800 contracts. */
const toNewRouteErrorResponse = (error) => {
    const safe = error instanceof QqApiError ? error : new QqApiError('unexpected');
    const status = defaults[safe.kind].status;
    return {
        status,
        headers: safe.retryAfterMs === undefined
            ? {}
            : { 'Retry-After': String(Math.ceil(safe.retryAfterMs / 1000)) },
        body: { code: status, ...safe.toJSON() },
    };
};

// Value coercions shared by the auth protocol modules. Upstream answers are untrusted JSON, so
// every field is read through one of these instead of being asserted into a type.
//
// This module is runtime-neutral on purpose: it must stay importable from a serverless bundle,
// so it may never gain a Node-only dependency.
const isDictionary = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const dictionaryOf = (value) => (isDictionary(value) ? value : {});
const stringOf = (value) => (typeof value === 'string' ? value : '');
const identifierOf = (value) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const numberOf = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
};
/**
 * Recognises an aborted request across both transports: axios reports `CanceledError` /
 * `ERR_CANCELED`, `fetch` reports `AbortError`, and `AbortSignal.timeout` reports `TimeoutError`.
 */
const isAbortError = (error) => {
    if (!isDictionary(error) && !(error instanceof Error))
        return false;
    const candidate = error;
    return (candidate.name === 'AbortError' ||
        candidate.name === 'TimeoutError' ||
        candidate.name === 'CanceledError' ||
        candidate.code === 'ERR_CANCELED' ||
        candidate.code === 'ABORT_ERR');
};
const parseDictionary = (value) => {
    if (isDictionary(value))
        return value;
    if (typeof value !== 'string')
        return {};
    try {
        return dictionaryOf(JSON.parse(value));
    }
    catch {
        return {};
    }
};

const levelWeight = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
    silent: 50,
};
const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.JEST_WORKER_ID);
const resolveLogLevel = () => {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase();
    if (envLevel && envLevel in levelWeight) {
        return envLevel;
    }
    return isTestEnv ? 'error' : 'info';
};
const activeLevel = resolveLogLevel();
const shouldLog = (level) => levelWeight[level] >= levelWeight[activeLevel];
const write = (level, method) => (...args) => {
    if (shouldLog(level)) {
        console[method](...args);
    }
};
const logger = {
    debug: write('debug', 'log'),
    info: write('info', 'log'),
    warn: write('warn', 'warn'),
    error: write('error', 'error'),
};

/**
 * 把任意异常收敛成可以安全对外的摘要：旧路由的 500 回应和日志都只用它，不再直接带出原始异常。
 *
 * 原始异常（尤其是 AxiosError）会带着 config、请求地址、header、body、stack，甚至凭证和账号、
 * 设备标识。这里只按白名单挑出几样东西：已知的错误名、已知的网络错误码、合法的 HTTP 状态码、
 * 已知的协议阶段和安全整数业务码；message 一律由固定模板生成，不会出现原始文字。
 *
 * 这个模块不 import 任何东西：serverless 和日志路径都会用到它，依赖闭包必须保持干净。
 * 协议错误按 name 和字段识别，而不是 import 登录模块的类；字段不合法时退回通用摘要。
 */
/** `callMusicu` 等协议调用使用的阶段名；不在这里的阶段不会出现在回应或日志中。 */
const UPSTREAM_PHASES = [
    'get-music-play',
    'get-music-play-retry',
    'get-playback-hint',
    'get-preview-detail',
    'get-quality-detail',
    'get-user-vip',
    'playlist-track-write',
    'playlist-subscribe',
    'song-like',
    'album-subscribe',
    'playlist-create',
    'playlist-delete',
    'playlist-rename',
    'subscription-status',
    'get-cdn-dispatch',
    'get-session',
    'create-qr',
    'credential-exchange',
    'get-login-user',
    'credential-refresh',
    'get-user-playlists',
    'get-user-favorite-playlists',
    'get-created-playlist-play-counts',
    'get-favorite-playlist-play-counts',
    'get-user-favorite-albums',
    'get-song-list-detail',
    'get-owned-playlist-songs',
    'get-user-liked-songs',
    'get-guess-you-like',
    'get-daily-songs',
    'get-recommend-playlists',
    'get-radio-list',
    'get-radio-tracks',
    'get-playlist-categories',
    'get-category-playlists',
    'get-new-songs',
    'search',
];
const GENERIC_MESSAGE = 'Service request failed';
const SAFE_NAMES = new Set([
    'Error',
    'TypeError',
    'RangeError',
    'SyntaxError',
    'AxiosError',
    'CanceledError',
    'AbortError',
    'TimeoutError',
    'QqProtocolError',
    'QqDeviceBootstrapError',
    'AuthCredentialRejectedError',
    'RequestRejectedError',
    'QrLoginServiceError',
    'WechatQrError',
    'SealedSessionError',
    'SessionCryptoError',
]);
/**
 * 程序自己抛出的固定文字。日志用它们说明具体原因；不在这里的文字一律不记录，因为它可能夹带
 * 地址、凭证或调用方输入。新增固定文字时要登记，`tests/safeError.reasons.test.ts` 会扫描 src 检查。
 */
const KNOWN_REASONS = new Set([
    'A session secret is required',
    'A session secret is required to open state',
    'A session secret is required to seal state',
    'Another QR login is already active',
    'CreateQRCode response missing a valid PNG/qrcodeID',
    'Decrypted state is not valid JSON',
    'GetSession response missing uid/sid',
    'Login credential is missing encryptUin',
    'Login response missing credential',
    'MQTT WebSocket closed',
    'MQTT WebSocket error',
    'MQTT cookies missing login credential',
    'MQTT handshake failed',
    'MQTT handshake timeout',
    'MQTT packet timeout',
    'MQTT redirect limit exceeded',
    'Malformed MQTT variable integer',
    'QQ auth redirect limit exceeded',
    'QR login is temporarily backed off',
    'QR session cannot create another code',
    'QR session has no upstream QR after createQr()',
    'QR session not found or expired',
    'RSAES-PKCS1-v1_5 payload too long for this key',
    'Request body must be a JSON object.',
    'Sealed payload is not valid JSON',
    'State failed authentication',
    'State is not a readable envelope',
    'State was written by an unsupported envelope version',
    'Token failed authentication',
    'Token field iv has an unusable length',
    'Token is not a sealed session',
    'Token was sealed by an unknown key',
    'Token was sealed for another purpose',
    'Truncated MQTT CONNACK',
    'Truncated MQTT PUBLISH',
    'Truncated MQTT properties',
    'Truncated MQTT subscription identifier',
    'Unable to create QR login',
    'Unable to start QR login',
    'Unrecognised WeChat QR status',
    'Unsupported MQTT WebSocket payload',
    'uid must be the logged-in account',
    'WeChat QR response is not a PNG/JPEG image',
    'WeChat authorization missing code',
    'WeChat poll response missing wx_errcode',
    'WeChat qrconnect response missing uuid',
]);
/** 由字段名或十六进制码组成的固定模板；整句都必须吻合，多一个字都不算。 */
const KNOWN_REASON_PATTERNS = [
    /^MQTT (?:CONNACK|SUBACK) rejected: 0x[0-9a-f]{1,2}$/,
    /^Unsupported MQTT property 0x[0-9a-f]{1,2}$/,
    /^QQ auth request failed with status [1-5]\d{2}$/,
    /^Token field [a-z]{1,16} is not base64url$/,
    /^Envelope field [a-z]{1,16} (?:is missing|has an unusable length)$/,
];
/** 很长的配置错误只记录开头那句固定说明。 */
const KNOWN_REASON_PREFIXES = [
    'Legacy QQ HTTP transport is not registered',
    'No AuthHttpClient was provided',
    'The QQ App channel needs an MQTT listener and this runtime has none',
];
const TIMEOUT_CODES = new Set([
    'ETIMEDOUT',
    'ECONNABORTED',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT',
]);
const NETWORK_CODES = new Set([
    'ENOTFOUND',
    'EAI_AGAIN',
    'ECONNREFUSED',
    'ECONNRESET',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'EPIPE',
    'ERR_NETWORK',
    'UND_ERR_SOCKET',
]);
const SAFE_CODES = new Set([
    ...TIMEOUT_CODES,
    ...NETWORK_CODES,
    'ERR_CANCELED',
    'ERR_BAD_RESPONSE',
    'ERR_BAD_REQUEST',
    'ERR_FR_TOO_MANY_REDIRECTS',
]);
const PHASES = new Set(UPSTREAM_PHASES);
/** getter 可能抛错、值可能是任意类型；读不到就当作没有。 */
const read$3 = (value, key) => {
    if ((typeof value !== 'object' && typeof value !== 'function') || value === null)
        return undefined;
    try {
        return value[key];
    }
    catch {
        return undefined;
    }
};
const safeInteger = (value) => typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
const httpStatus = (value) => {
    const status = safeInteger(value);
    return status !== undefined && status >= 100 && status <= 599 ? status : undefined;
};
const safeCode = (value) => typeof value === 'string' && SAFE_CODES.has(value) ? value : undefined;
const safeName = (value) => typeof value === 'string' && SAFE_NAMES.has(value) ? value : 'Error';
const codeOrUnknown = (value) => value === undefined ? 'unknown' : String(value);
/** `QqProtocolError`：阶段、HTTP 状态和两个业务码都合法才认，否则交给通用规则。 */
const protocolSummary = (error) => {
    const status = httpStatus(read$3(error, 'httpStatus'));
    const globalCode = safeInteger(read$3(error, 'globalCode'));
    const rawUpstreamCode = read$3(error, 'upstreamCode');
    const upstreamCode = safeInteger(rawUpstreamCode);
    if (status === undefined || globalCode === undefined)
        return undefined;
    if (rawUpstreamCode !== undefined && upstreamCode === undefined)
        return undefined;
    const phase = read$3(error, 'phase');
    const stage = typeof phase === 'string' && PHASES.has(phase) ? phase : undefined;
    return {
        name: 'QqProtocolError',
        message: `${stage ?? 'Upstream request'} failed (HTTP ${status}, global=${globalCode}, code=${codeOrUnknown(upstreamCode)})`,
        status,
        ...(stage === undefined ? {} : { stage }),
        ...(upstreamCode === undefined ? {} : { upstreamCode }),
        globalCode,
    };
};
const bootstrapSummary = (error) => {
    const status = httpStatus(read$3(error, 'httpStatus'));
    const rawOuter = read$3(error, 'outerCode');
    const rawInner = read$3(error, 'innerCode');
    const outer = safeInteger(rawOuter);
    const inner = safeInteger(rawInner);
    if (status === undefined)
        return undefined;
    if ((rawOuter !== undefined && outer === undefined) ||
        (rawInner !== undefined && inner === undefined))
        return undefined;
    return {
        name: 'QqDeviceBootstrapError',
        message: `QIMEI bootstrap failed (HTTP ${status}, outer=${codeOrUnknown(outer)}, inner=${codeOrUnknown(inner)})`,
        status,
        stage: 'device-bootstrap',
        ...(outer === undefined ? {} : { upstreamCode: outer }),
    };
};
const reasonOf = (error) => {
    const message = read$3(error, 'message');
    if (typeof message !== 'string')
        return undefined;
    if (KNOWN_REASONS.has(message))
        return message;
    if (KNOWN_REASON_PATTERNS.some((pattern) => pattern.test(message)))
        return message;
    return KNOWN_REASON_PREFIXES.find((prefix) => message.startsWith(`${prefix}.`));
};
const summarize = (error) => {
    const name = safeName(read$3(error, 'name'));
    if (name === 'QqProtocolError') {
        const summary = protocolSummary(error);
        if (summary)
            return summary;
    }
    if (name === 'QqDeviceBootstrapError') {
        const summary = bootstrapSummary(error);
        if (summary)
            return summary;
    }
    if (name === 'AuthCredentialRejectedError') {
        const upstreamCode = safeInteger(read$3(error, 'upstreamCode'));
        return {
            name,
            message: 'Login required',
            ...(upstreamCode === undefined ? {} : { upstreamCode }),
        };
    }
    const code = safeCode(read$3(error, 'code')) ?? safeCode(read$3(read$3(error, 'cause'), 'code'));
    const status = httpStatus(read$3(read$3(error, 'response'), 'status')) ??
        httpStatus(read$3(error, 'httpStatus')) ??
        httpStatus(read$3(error, 'status'));
    const wechatCode = name === 'WechatQrError' ? safeInteger(read$3(error, 'upstreamCode')) : undefined;
    const extras = {
        ...(code === undefined ? {} : { code }),
        ...(status === undefined ? {} : { status }),
        ...(wechatCode === undefined ? {} : { upstreamCode: wechatCode }),
    };
    if (status !== undefined)
        return { name, message: `Upstream request failed (HTTP ${status})`, ...extras };
    if (name === 'TimeoutError' || (code !== undefined && TIMEOUT_CODES.has(code)))
        return { name, message: 'Upstream request timed out', ...extras };
    if (name === 'AbortError' || name === 'CanceledError' || code === 'ERR_CANCELED')
        return { name, message: 'Upstream request was canceled', ...extras };
    if (code !== undefined && NETWORK_CODES.has(code))
        return { name, message: `Upstream request failed (${code})`, ...extras };
    return { name, message: GENERIC_MESSAGE, ...extras };
};
/** 任意异常 → 日志可用的安全摘要；认得的固定文字另外放进 `reason`。 */
const summarizeError = (error) => {
    const summary = summarize(error);
    const reason = reasonOf(error);
    return reason === undefined ? summary : { ...summary, reason };
};
/** 旧曲库服务 500 回应里的 `error` 对象：只保留名称、固定文案、白名单错误码和上游状态码。 */
const toLegacyErrorBody = (error) => {
    const { name, message, code, status } = summarizeError(error);
    return {
        name,
        message,
        ...(code === undefined ? {} : { code }),
        ...(status === undefined ? {} : { status }),
    };
};
/** 控制器层与 serverless 兜底 500 回应里的 `error` 字符串。 */
const toLegacyErrorMessage = (error) => summarizeError(error).message;

const okResult = (body) => ({
    status: 200,
    headers: {},
    body: { code: 200, ...body },
});
/** 错误核心已经验证过的数字字段；诊断只取这几个。 */
const SAFE_NUMBER_KEYS = [
    'upstreamCode',
    'upstreamGlobalCode',
    'upstreamSubCode',
    'upstreamHttpStatus',
    'retryAfterMs',
];
/**
 * 开发诊断：debug 级别，平时看不到，LOG_LEVEL=debug 才输出。
 * 只放 phase、状态码、errorKey 和安全整数，不放凭证、账号 id、网址或上游原文。
 */
const diagnose = (phase, details) => {
    logger.debug('recommend.request-diagnostic', { phase, ...details });
};
/**
 * 对外只给一般化的文字。5xx 与 429 写一条 warn；401、422 这类预期中的结果只写 debug 诊断，
 * 同一个失败不重复记。
 */
const failureResult = (phase, error) => {
    const response = toNewRouteErrorResponse(error);
    if (response.status >= 500 || response.status === 429) {
        logger.warn('recommend.request-failed', {
            phase,
            ...(error instanceof QqApiError ? error.toJSON() : summarizeError(error)),
        });
        return response;
    }
    const numbers = {};
    for (const key of SAFE_NUMBER_KEYS) {
        const value = response.body[key];
        if (typeof value === 'number' && Number.isSafeInteger(value))
            numbers[key] = value;
    }
    diagnose(phase, { status: response.status, errorKey: response.body.errorKey, ...numbers });
    return response;
};

/** An adapter observation, containing no native exception, URL, body or credential. */
class HttpTransportError extends Error {
    code;
    phase;
    constructor(observation) {
        super('HTTP transport failed');
        this.name = 'HttpTransportError';
        this.code = observation.code;
        this.phase = observation.phase;
    }
}
const checkAbort = (signal) => {
    if (signal.aborted)
        throw new QqApiError('network', { errorKey: 'network.aborted' });
};
const sleep = (ms, signal) => new Promise((resolve, reject) => {
    checkAbort(signal);
    const finish = () => {
        signal.removeEventListener('abort', abort);
        resolve();
    };
    const timer = setTimeout(finish, Math.min(ms, 2_147_483_647));
    const abort = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        reject(new QqApiError('network', { errorKey: 'network.aborted' }));
    };
    signal.addEventListener('abort', abort, { once: true });
});
/** One budget covers queueing, every attempt, reading the body and backoff. */
const withDeadline$2 = async (run, timeoutMs, external) => {
    if (external?.aborted)
        throw new QqApiError('network', { errorKey: 'network.aborted' });
    const controller = new AbortController();
    let timer;
    let abort = () => { };
    const interrupted = new Promise((_resolve, reject) => {
        abort = () => {
            reject(new QqApiError('network', { errorKey: 'network.aborted' }));
            controller.abort();
        };
        external?.addEventListener('abort', abort, { once: true });
        timer = setTimeout(() => {
            reject(new QqApiError('network', { errorKey: 'network.timeout' }));
            controller.abort();
        }, timeoutMs);
    });
    try {
        return await Promise.race([interrupted, run(controller.signal)]);
    }
    finally {
        clearTimeout(timer);
        external?.removeEventListener('abort', abort);
        controller.abort();
    }
};

/** One token per outgoing HTTP attempt, including a batch and each retry. */
const createTokenBucket = (options = {}) => {
    const rate = options.ratePerSecond ?? 10;
    const burst = options.burst ?? 50;
    if (!Number.isFinite(rate) || rate <= 0 || !Number.isSafeInteger(burst) || burst < 1)
        throw new QqApiError('input');
    const now = options.now ?? (() => performance.now());
    let tokens = burst;
    let previous = now();
    return {
        async acquire(signal) {
            for (;;) {
                checkAbort(signal);
                const current = now();
                tokens = Math.min(burst, tokens + (Math.max(0, current - previous) * rate) / 1000);
                // A clock moving backwards cannot manufacture additional tokens.
                previous = Math.max(previous, current);
                if (tokens >= 1) {
                    tokens -= 1;
                    return;
                }
                await sleep(Math.max(1, Math.ceil(((1 - tokens) * 1000) / rate)), signal);
            }
        },
    };
};
// Global to this process / isolate, never a cross-account request or Cookie cache.
const defaultTokenBucket = createTokenBucket();

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer$1 = (value) => typeof value === 'number' && Number.isSafeInteger(value);
const snapshot = (value) => {
    try {
        return JSON.parse(JSON.stringify(value, (_key, entry) => {
            if (entry === undefined ||
                ['function', 'symbol', 'bigint'].includes(typeof entry) ||
                (typeof entry === 'number' && !Number.isFinite(entry)))
                throw new Error();
            return entry;
        }));
    }
    catch {
        throw new QqApiError('input');
    }
};
const prepare = (input) => {
    if (!input ||
        typeof input.module !== 'string' ||
        !input.module.trim() ||
        typeof input.method !== 'string' ||
        !input.method.trim() ||
        !object(input.param) ||
        typeof input.readOnly !== 'boolean' ||
        (input.decode !== undefined && typeof input.decode !== 'function') ||
        (input.allowedCodes !== undefined &&
            (!Array.isArray(input.allowedCodes) || !input.allowedCodes.every(integer$1))))
        throw new QqApiError('input');
    return { ...input, param: snapshot(input.param), allowedCodes: [...(input.allowedCodes ?? [])] };
};
const unpack = (body, requests) => {
    if (!object(body) || !integer$1(body.code))
        throw new QqApiError('invalid-response');
    if (body.code !== 0)
        throw normalizeQqFailure({ source: 'gateway', upstreamGlobalCode: body.code });
    return requests.map((request, index) => {
        const item = body[`req_${index}`];
        if (!object(item) ||
            !integer$1(item.code) ||
            (item.subcode !== undefined && !integer$1(item.subcode)))
            return { ok: false, error: new QqApiError('invalid-response') };
        if (item.code !== 0 && !request.allowedCodes?.includes(item.code))
            return {
                ok: false,
                error: normalizeQqFailure({
                    source: 'business',
                    upstreamCode: item.code,
                    upstreamGlobalCode: body.code,
                    upstreamSubCode: item.subcode,
                }, { operation: request.operation }),
            };
        if (!Object.hasOwn(item, 'data') || (item.subcode !== undefined && item.subcode !== 0))
            return {
                ok: false,
                error: new QqApiError('invalid-response', { upstreamSubCode: item.subcode }),
            };
        try {
            return {
                ok: true,
                code: item.code,
                data: request.decode ? request.decode(item.data) : item.data,
            };
        }
        catch {
            return { ok: false, error: new QqApiError('invalid-response') };
        }
    });
};
/** Explicit batches share only this client's immutable comm/header context. Old routes do not use it. */
const createMusicuClient = (options) => {
    if (!object(options.comm))
        throw new QqApiError('input');
    const comm = snapshot(options.comm);
    const headers = snapshot(options.headers ?? {});
    const http = options.http;
    const limiter = options.limiter ?? defaultTokenBucket;
    const timeoutMs = options.timeoutMs ?? 25000;
    const maxRetries = options.maxRetries ?? 2;
    const random = options.random ?? Math.random;
    if (!Number.isSafeInteger(timeoutMs) ||
        timeoutMs <= 0 ||
        timeoutMs > 2_147_483_647 ||
        !Number.isSafeInteger(maxRetries) ||
        maxRetries < 0 ||
        maxRetries > 2)
        throw new QqApiError('input');
    const executeBatch = async (inputs, execution = {}) => {
        const requests = inputs.map(prepare);
        if (!requests.length)
            return [];
        const payload = { comm };
        requests.forEach((r, index) => {
            payload[`req_${index}`] = { module: r.module, method: r.method, param: r.param };
        });
        const body = JSON.stringify(payload);
        const readOnly = requests.every((r) => r.readOnly);
        return withDeadline$2(async (signal) => {
            for (let attempt = 0;; attempt += 1) {
                await limiter.acquire(signal);
                checkAbort(signal);
                let error;
                try {
                    const response = await http({
                        url: 'https://u.y.qq.com/cgi-bin/musicu.fcg',
                        body,
                        headers: { ...headers },
                        signal,
                    });
                    checkAbort(signal);
                    if (!integer$1(response.status) || response.status < 200 || response.status > 599)
                        throw new QqApiError('invalid-response');
                    if (response.status >= 400) {
                        error = normalizeQqFailure({
                            source: 'http',
                            upstreamHttpStatus: response.status,
                            retryAfterMs: response.retryAfterMs,
                        }, { readOnly });
                    }
                    else if (response.status >= 300) {
                        throw new QqApiError('invalid-response');
                    }
                    else
                        return unpack(response.body, requests);
                }
                catch (failure) {
                    checkAbort(signal);
                    error =
                        failure instanceof QqApiError
                            ? failure
                            : normalizeQqFailure({
                                source: 'network',
                                error: failure instanceof HttpTransportError ? { code: failure.code } : undefined,
                            }, {
                                readOnly,
                                networkPhase: failure instanceof HttpTransportError ? failure.phase : 'unknown',
                            });
                }
                if (!readOnly || !error.retryable || attempt >= maxRetries)
                    throw error;
                const base = 200 * 2 ** attempt;
                const jitter = random();
                await sleep(base +
                    Math.floor(base * (Number.isFinite(jitter) ? Math.max(0, Math.min(1, jitter)) : 0)), signal);
            }
        }, timeoutMs, execution.signal);
    };
    return {
        executeBatch,
        async execute(request, execution = {}) {
            const [result] = await executeBatch([request], execution);
            if (!result.ok)
                throw result.error;
            return result.data;
        },
    };
};

/**
 * The cookie jar and redirect rules the QQ auth protocol needs, kept apart from any one HTTP
 * client so both the axios client and the serverless fetch client share exactly one implementation.
 *
 * Moved here verbatim from `httpClient.ts`. Nothing in this file may import a value from `axios`
 * or anything reaching `node:fs`: it is bundled into the serverless runtime, where the dependency
 * closure test asserts neither appears.
 *
 * Why a hand-written jar at all: the upstream login flow spreads its state across `set-cookie`
 * headers on redirect hops, and the platforms this package targets do not agree on cookie handling
 * — Node's axios has no jar, and `fetch` deliberately refuses to expose `set-cookie` on redirects
 * it follows itself. Owning the jar is what makes the protocol behave identically on both.
 */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 3;
const JSON_CONTENT_TYPE = 'application/json';
const normalizeSetCookies = (value) => {
    if (Array.isArray(value))
        return value.filter((item) => typeof item === 'string');
    return typeof value === 'string' ? [value] : [];
};
const updateCookieJar = (jar, setCookies) => {
    for (const setCookie of setCookies) {
        const pair = setCookie.split(';', 1)[0];
        const separator = pair.indexOf('=');
        if (separator <= 0)
            continue;
        const name = pair.slice(0, separator).trim();
        const value = pair.slice(separator + 1).trim();
        if (value)
            jar.set(name, value);
        else
            jar.delete(name);
    }
};
const cookieHeader = (jar) => Array.from(jar, ([name, value]) => `${name}=${value}`).join('; ');
/**
 * Seeds a jar from `cookieHeader`'s own output — a flat `name=value; name2=value2` string, unlike
 * `updateCookieJar`'s `Set-Cookie` list. This is how a serverless invocation restores the jar a
 * previous, already-finished invocation captured: there is no live response to read `Set-Cookie`
 * headers from, only the header string that was sealed alongside the rest of the session state.
 */
const seedCookieJar = (jar, header) => {
    for (const entry of header.split(';')) {
        const separator = entry.indexOf('=');
        if (separator <= 0)
            continue;
        const name = entry.slice(0, separator).trim();
        const value = entry.slice(separator + 1).trim();
        if (name && value)
            jar.set(name, value);
    }
};
const mergeCookieHeaders = (...headers) => {
    const merged = new Map();
    for (const header of headers) {
        for (const item of header.split(';')) {
            const separator = item.indexOf('=');
            const name = item.slice(0, separator).trim();
            const value = item.slice(separator + 1).trim();
            if (name)
                merged.set(name, value);
        }
    }
    return cookieHeader(merged);
};
/** 303 always becomes GET; 301/302 downgrade POST to GET. 307/308 preserve the method. */
const redirectedMethod = (status, method) => {
    if (status === 303)
        return 'GET';
    if ([301, 302].includes(status) && String(method).toUpperCase() === 'POST')
        return 'GET';
    return method ?? 'GET';
};

const property = (value, key) => {
    try {
        return value && typeof value === 'object' ? value[key] : undefined;
    }
    catch {
        return undefined;
    }
};
const observedFailure = (raw, reading, signal) => {
    checkAbort(signal);
    const code = property(raw, 'code') ?? property(property(raw, 'cause'), 'code');
    const name = property(raw, 'name');
    if (name === 'AbortError' ||
        name === 'CanceledError' ||
        code === 'ABORT_ERR' ||
        code === 'ERR_CANCELED')
        return new HttpTransportError({ phase: reading ? 'read' : 'unknown', code: 'ABORT_ERR' });
    const known = [
        'ENOTFOUND',
        'EAI_AGAIN',
        'ECONNREFUSED',
        'ECONNRESET',
        'ETIMEDOUT',
        'ECONNABORTED',
    ];
    const connect = !reading &&
        typeof code === 'string' &&
        ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT'].includes(code);
    const safeCode = code === 'UND_ERR_CONNECT_TIMEOUT' || name === 'TimeoutError'
        ? 'ETIMEDOUT'
        : typeof code === 'string' && known.includes(code)
            ? code
            : undefined;
    return new HttpTransportError({
        phase: reading ? 'read' : connect ? 'connect' : 'unknown',
        code: safeCode,
    });
};
const retryDelay = (value) => {
    if (!value || !/^\d+(?:\.\d+)?$/.test(value))
        return undefined;
    const ms = Math.ceil(Number(value) * 1000);
    return Number.isSafeInteger(ms) && ms >= 0 ? ms : undefined;
};
/** Native fetch works in Node and Web hosts; inject a host executor for testing or embedding. */
const createFetchTransport = (fetcher = globalThis.fetch) => {
    const jars = new Map();
    // This instance must belong to one session context; never share it across accounts.
    return async (request) => {
        checkAbort(request.signal);
        const origin = new URL(request.url).origin;
        let jar = jars.get(origin);
        if (!jar) {
            jar = new Map();
            jars.set(origin, jar);
        }
        const headers = { 'Content-Type': 'application/json' };
        let explicitCookie = '';
        for (const [key, value] of Object.entries(request.headers)) {
            if (key.toLowerCase() === 'cookie')
                explicitCookie = value;
            else if (key.toLowerCase() !== 'content-type')
                headers[key] = value;
        }
        const cookies = mergeCookieHeaders(cookieHeader(jar), explicitCookie);
        if (cookies)
            headers.Cookie = cookies;
        let response;
        try {
            response = await fetcher(request.url, {
                method: 'POST',
                redirect: 'error',
                headers,
                body: request.body,
                signal: request.signal,
            });
        }
        catch (error) {
            throw observedFailure(error, false, request.signal);
        }
        checkAbort(request.signal);
        if (!Number.isSafeInteger(response.status) || response.status < 100 || response.status > 599)
            throw new QqApiError('invalid-response');
        const retryAfterMs = retryDelay(response.headers?.get('Retry-After'));
        if (response.status < 200 || response.status >= 300) {
            // Do not parse or retain error bodies. Release the stream without waiting for an error page.
            void response.body?.cancel().catch(() => { });
            return { status: response.status, retryAfterMs };
        }
        const setCookies = response.headers?.getSetCookie?.() ??
            response.headers?.get('set-cookie')?.split(/,(?=\s*[^;,=\s]+=[^;]*)/) ??
            [];
        let text;
        try {
            text = await response.text();
        }
        catch (error) {
            throw observedFailure(error, true, request.signal);
        }
        checkAbort(request.signal);
        let body;
        try {
            body = JSON.parse(text);
        }
        catch {
            throw new QqApiError('invalid-response');
        }
        updateCookieJar(jar, setCookies);
        return { status: response.status, body };
    };
};

class WebBytes extends Uint8Array {
    slice(start, end) {
        return this.subarray(start, end);
    }
    readUInt16BE(offset = 0) {
        this.checkOffset(offset);
        return new DataView(this.buffer, this.byteOffset, this.byteLength).getUint16(offset);
    }
    writeUInt16BE(value, offset = 0) {
        this.checkOffset(offset);
        if (value < 0 || value > 65535 || !Number.isFinite(value))
            throw new RangeError('Invalid unsigned length');
        new DataView(this.buffer, this.byteOffset, this.byteLength).setUint16(offset, value);
        return offset + 2;
    }
    checkOffset(offset) {
        if (!Number.isInteger(offset) || offset < 0 || offset + 2 > this.length)
            throw new RangeError('Invalid byte offset');
    }
    toString(encoding = 'utf8', start = 0, end = this.length) {
        const bytes = this.subarray(Math.max(0, start), Math.max(0, end));
        if (encoding === 'hex')
            return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
        if (encoding === 'base64' || encoding === 'base64url') {
            let binary = '';
            for (const byte of bytes)
                binary += String.fromCharCode(byte);
            const encoded = btoa(binary);
            return encoding === 'base64url'
                ? encoded.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
                : encoded;
        }
        return new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
    }
    toJSON() {
        return { type: 'Buffer', data: [...this] };
    }
}
const from = (value, encodingOrOffset, length) => {
    if (typeof value === 'string') {
        if (encodingOrOffset === 'hex') {
            const bytes = [];
            for (let offset = 0; offset + 1 < value.length; offset += 2) {
                const pair = value.slice(offset, offset + 2);
                if (!/^[0-9a-f]{2}$/i.test(pair))
                    break;
                bytes.push(Number.parseInt(pair, 16));
            }
            return new WebBytes(bytes);
        }
        if (encodingOrOffset === 'base64' || encodingOrOffset === 'base64url') {
            let clean = value
                .replaceAll('-', '+')
                .replaceAll('_', '/')
                .replace(/[^A-Za-z0-9+/=]/g, '')
                .split('=')[0];
            if (clean.length % 4 === 1)
                clean = clean.slice(0, -1);
            const decoded = atob(clean + '='.repeat((4 - (clean.length % 4)) % 4));
            return new WebBytes(Array.from(decoded, (char) => char.charCodeAt(0)));
        }
        return new WebBytes(new TextEncoder().encode(value));
    }
    if (value instanceof ArrayBuffer ||
        (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer)) {
        const offset = typeof encodingOrOffset === 'number' ? encodingOrOffset : 0;
        return new WebBytes(value, offset, length ?? value.byteLength - offset);
    }
    return new WebBytes(value);
};
const alloc = (size) => {
    if (!Number.isSafeInteger(size) || size < 0)
        throw new RangeError('Invalid byte length');
    return new WebBytes(size);
};
const webBuffer = {
    from,
    alloc,
    allocUnsafe: alloc,
    isBuffer: (value) => value instanceof WebBytes,
    byteLength: (value, encoding) => from(value, encoding).length,
    concat: (list, totalLength = list.reduce((sum, bytes) => sum + bytes.length, 0)) => {
        const result = alloc(totalLength);
        let offset = 0;
        for (const bytes of list) {
            const count = Math.min(bytes.length, result.length - offset);
            result.set(bytes.subarray(0, count), offset);
            offset += count;
            if (offset === result.length)
                break;
        }
        return result;
    },
};
const Buffer$1 = globalThis.Buffer ??
    webBuffer;

// Synthetic Android device material and the QIMEI bootstrap request construction.
//
// Runtime-neutral by contract, and literally so: this module imports no platform module at all,
// `node:crypto` included. A Vercel Edge Function refuses to deploy a bundle that imports
// `node:crypto` at all — `nodejs_compat`-style opt-ins are a Cloudflare Workers thing, not a
// Vercel one — so unlike the M0-era assumption ("Workers can have it, Vercel wasn't checked"),
// there is no platform flag to lean on here. Every operation below (MD5, the QIMEI RSA/AES
// envelope, uniform random integers) is built on `globalThis.crypto`, which Node ≥20, Electron,
// Cloudflare Workers and the Vercel Edge Runtime all implement identically as the Web Crypto API
// — so this one implementation is what every runtime actually runs, not a serverless substitute
// for a Node original. `md5` and the RSAES-PKCS1-v1_5 encryption in `buildQimeiRequest` are
// hand-rolled because Web Crypto has neither: `subtle.digest` only offers the SHA family, and
// `subtle` only offers RSA-OAEP / RSASSA-PKCS1-v1_5 *signing*, not the PKCS1-v1_5 *encryption*
// padding this bootstrap protocol requires. Both are verified byte-for-byte against `node:crypto`
// in `tests/services.qimei-crypto.test.ts` — the RSA step via an encrypt/decrypt round trip
// through a throwaway keypair, since there is no private key for the real QIMEI bootstrap key to
// decrypt with. AES-128-CBC has a native Web Crypto primitive (`subtle.encrypt`), so that one is
// not hand-rolled; the only reason it forces `buildQimeiRequest` to become `async` is that
// `subtle.encrypt` is Promise-based where `node:crypto`'s cipher API was synchronous. Persistence
// (`node:fs`) lives in `deviceContext.ts` and the MQTT transport lives in `qrLogin.ts`, so neither
// reaches a serverless bundle through this file either.
//
// Values here identify a synthetic device, never a user: no musickey, MQTT token or QR key is
// ever stored, logged or returned.
const QIMEI_URL = 'https://api.tencentmusic.com/tme/trpc/proxy';
// Public Android client protocol constants, not user credentials.
const QIMEI_SECRET = 'ZdJqM15EeO2zWc08';
const QIMEI_APP_KEY = '0AND0HD6FE4HY80F';
const CHANNEL_ID = '10003505';
const PACKAGE_ID = 'com.tencent.qqmusic';
// ---- MD5 (RFC 1321) ---------------------------------------------------------------------------
// Web Crypto's `subtle.digest` does not offer MD5 (only the SHA family), and the QIMEI protocol's
// two `sign` fields are MD5 hex digests of concatenated strings — the same input `hash.update()`
// called once per argument used to produce. Verified byte-for-byte against `node:crypto` across a
// range of inputs, including ones long enough to span multiple 64-byte blocks, in
// `tests/services.qimei-crypto.test.ts`.
const MD5_SHIFTS = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
    20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6,
    10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const MD5_CONSTANTS = Int32Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 2 ** 32));
const rotateLeft32 = (value, bits) => (value << bits) | (value >>> (32 - bits));
const md5Digest = (bytes) => {
    const bitLength = BigInt(bytes.length) * 8n;
    // Zero-pad after the mandatory `0x80` byte until the length is 56 (mod 64), leaving exactly 8
    // bytes for the trailing bit-length field to land on a 64-byte block boundary.
    const paddingLength = (56 - ((bytes.length + 1) % 64) + 64) % 64;
    const total = bytes.length + 1 + paddingLength + 8;
    const message = new Uint8Array(total);
    message.set(bytes);
    message[bytes.length] = 0x80;
    const view = new DataView(message.buffer);
    view.setBigUint64(total - 8, bitLength, true);
    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;
    for (let chunkStart = 0; chunkStart < total; chunkStart += 64) {
        const words = new Int32Array(16);
        for (let index = 0; index < 16; index += 1)
            words[index] = view.getInt32(chunkStart + index * 4, true);
        let a = a0;
        let b = b0;
        let c = c0;
        let d = d0;
        for (let index = 0; index < 64; index += 1) {
            let f;
            let g;
            if (index < 16) {
                f = (b & c) | (~b & d);
                g = index;
            }
            else if (index < 32) {
                f = (d & b) | (~d & c);
                g = (5 * index + 1) % 16;
            }
            else if (index < 48) {
                f = b ^ c ^ d;
                g = (3 * index + 5) % 16;
            }
            else {
                f = c ^ (b | ~d);
                g = (7 * index) % 16;
            }
            f = (f + a + MD5_CONSTANTS[index] + words[g]) | 0;
            a = d;
            d = c;
            c = b;
            b = (b + rotateLeft32(f, MD5_SHIFTS[index])) | 0;
        }
        a0 = (a0 + a) | 0;
        b0 = (b0 + b) | 0;
        c0 = (c0 + c) | 0;
        d0 = (d0 + d) | 0;
    }
    const digest = new Uint8Array(16);
    const digestView = new DataView(digest.buffer);
    digestView.setInt32(0, a0, true);
    digestView.setInt32(4, b0, true);
    digestView.setInt32(8, c0, true);
    digestView.setInt32(12, d0, true);
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
};
const md5 = (...values) => md5Digest(new TextEncoder().encode(values.join('')));
// ---- Uniform randomness -------------------------------------------------------------------------
// `getRandomValues` is synchronous and identical across every runtime this package targets, unlike
// `node:crypto`'s `randomBytes`/`randomInt`. Rejection sampling matches what `crypto.randomInt`
// does internally, so `randomInt` stays free of the modulo bias a plain `% maxExclusive` would add.
const randomInt = (maxExclusive) => {
    if (maxExclusive <= 1)
        return 0;
    const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
    let value;
    do {
        value = globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
    } while (value >= limit);
    return value % maxExclusive;
};
const randomHex = (length) => Buffer$1.from(globalThis.crypto.getRandomValues(new Uint8Array(Math.ceil(length / 2))))
    .toString('hex')
    .slice(0, length);
const randomDigits = (length) => {
    let value = '';
    for (let index = 0; index < length; index += 1)
        value += randomInt(10);
    return value;
};
const randomImei = () => {
    const digits = randomDigits(14).split('').map(Number);
    let sum = 0;
    for (let index = 0; index < digits.length; index += 1) {
        let digit = digits[index];
        if (index % 2 === 1)
            digit = digit * 2 > 9 ? digit * 2 - 9 : digit * 2;
        sum += digit;
    }
    digits.push((10 - (sum % 10)) % 10);
    return digits.join('');
};
const createAndroidDevice = () => ({
    display: `QMAPI.${randomDigits(6)}.001`,
    product: 'iarim',
    device: 'sagit',
    board: 'eomam',
    model: 'MI 6',
    fingerprint: `xiaomi/iarim/sagit:10/eomam.200122.001/${randomDigits(7)}:user/release-keys`,
    procVersion: `Linux 5.4.0-54-generic-${randomHex(8)} (android-build@google.com)`,
    imei: randomImei(),
    brand: 'Xiaomi',
    androidId: randomHex(16),
    openUdid: randomHex(32),
    osRelease: '10',
    sdk: 29,
});
const REQUIRED_TEXT_FIELDS = [
    'display',
    'product',
    'device',
    'board',
    'model',
    'fingerprint',
    'procVersion',
    'imei',
    'brand',
    'androidId',
    'openUdid',
    'osRelease',
];
const OPTIONAL_TEXT_FIELDS = ['qimei', 'qimei36', 'sessionUid', 'sessionSid'];
/** Rejects a truncated or hand-edited state file so a bad shape never reaches the protocol. */
const isAndroidDevice = (value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const candidate = value;
    if (!Number.isFinite(candidate.sdk))
        return false;
    if (candidate.qimeiSavedAt !== undefined && !Number.isFinite(candidate.qimeiSavedAt))
        return false;
    const hasText = (key) => typeof candidate[key] === 'string' && candidate[key].length > 0;
    if (!REQUIRED_TEXT_FIELDS.every(hasText))
        return false;
    return OPTIONAL_TEXT_FIELDS.every((key) => candidate[key] === undefined || hasText(key));
};
/**
 * Safe log/diagnostic shape: presence and shape only, never an identifier value.
 */
const describeDeviceContext = (device) => ({
    hasDevice: Boolean(device),
    hasQimei: Boolean(device?.qimei && device?.qimei36),
    qimeiAgeMs: device?.qimeiSavedAt === undefined ? undefined : Math.max(0, Date.now() - device.qimeiSavedAt),
    hasSession: Boolean(device?.sessionUid && device?.sessionSid),
});
const randomBeaconId = (now = new Date()) => {
    const month = `${now.toISOString().slice(0, 7)}-01`;
    const first = randomDigits(6);
    const second = randomDigits(9);
    const dated = new Set([1, 2, 13, 14, 17, 18, 21, 22, 25, 26, 29, 30, 33, 34, 37, 38]);
    const fields = [];
    for (let key = 1; key <= 40; key += 1) {
        if (dated.has(key))
            fields.push(`k${key}:${month}${first}.${second}`);
        else if (key === 3)
            fields.push('k3:0000000000000000');
        else if (key === 4)
            fields.push(`k4:${randomHex(16).replaceAll('0', '1')}`);
        else
            fields.push(`k${key}:${randomInt(10000)}`);
    }
    return `${fields.join(';')};`;
};
const buildQimeiPayload = (device, now = new Date()) => {
    const uptime = new Date(now.getTime() - randomInt(14401) * 1000)
        .toISOString()
        .replace('T', ' ')
        .slice(0, 19);
    const reserved = {
        harmony: '0',
        clone: '0',
        containe: '',
        oz: 'UhYmelwouA+V2nPWbOvLTgN2/m8jwGB+yUB5v9tysQg=',
        oo: 'Xecjt+9S1+f8Pz2VLSxgpw==',
        kelong: '0',
        uptimes: uptime,
        multiUser: '0',
        bod: device.brand,
        dv: device.device,
        firstLevel: '',
        manufact: device.brand,
        name: device.model,
        host: 'se.infra',
        kernel: device.procVersion,
    };
    return {
        androidId: device.androidId,
        platformId: 1,
        appKey: QIMEI_APP_KEY,
        appVersion: '14.9.0.8',
        beaconIdSrc: randomBeaconId(now),
        brand: device.brand,
        channelId: CHANNEL_ID,
        cid: '',
        imei: device.imei,
        imsi: '',
        mac: '',
        model: device.model,
        networkType: 'unknown',
        oaid: '',
        osVersion: `Android ${device.osRelease},level ${device.sdk}`,
        qimei: '',
        qimei36: '',
        sdkVersion: '1.2.13.6',
        targetSdkVersion: '33',
        audit: '',
        userId: '{}',
        packageId: PACKAGE_ID,
        deviceType: 'Phone',
        sdkName: '',
        reserved: JSON.stringify(reserved),
    };
};
// ---- QIMEI bootstrap envelope: RSA(PKCS1v1.5) key wrap + AES-128-CBC payload -------------------
// Tencent's bootstrap public key (a fixed constant, not a per-device or per-request value):
//   -----BEGIN PUBLIC KEY-----
//   MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDEIxgwoutfwoJxcGQeedgP7FG9qaIuS0qzfR8gWkrkTZKM2iWHn2ajQpBR
//   ZjMSoSf6+KJGvar2ORhBfpDXyVtZCKpqLQ+FLkpncClKVIrBwv6PHyUvuCb0rIarmgDnzkfQAqVufEtR64iazGDKatvJ9y6B
//   9NMbHddGSAUmRTCrHQIDAQAB
//   -----END PUBLIC KEY-----
// Its modulus/exponent are pre-extracted once, offline, rather than parsed from PEM/DER at runtime
// — one less thing this module needs a parser for. Re-derive them with
// `openssl rsa -pubin -in key.pem -noout -modulus` / `-text` if this key ever needs to change.
const QIMEI_RSA_MODULUS_HEX = 'c4231830a2eb5fc2827170641e79d80fec51bda9a22e4b4ab37d1f205a4ae44d928cda25879f66a3429051663312a12' +
    '7faf8a246bdaaf63918417e90d7c95b5908aa6a2d0f852e4a6770294a548ac1c2fe8f1f252fb826f4ac86ab9a00e7ce4' +
    '7d002a56e7c4b51eb889acc60ca6adbc9f72e81f4d31b1dd7464805264530ab1d';
const QIMEI_RSA_EXPONENT = 65537n;
const modPow = (base, exponent, modulus) => {
    let result = 1n;
    let b = base % modulus;
    let e = exponent;
    while (e > 0n) {
        if (e & 1n)
            result = (result * b) % modulus;
        e >>= 1n;
        b = (b * b) % modulus;
    }
    return result;
};
/**
 * RSAES-PKCS1-v1_5 encryption (RFC 8017 §7.2.1), generic over the key so it can be verified
 * against an arbitrary keypair. Neither Web Crypto (`subtle.encrypt` only offers RSA-OAEP) nor a
 * Node-only `crypto.publicEncrypt` call can produce this padding on every target runtime, so it is
 * implemented directly over `BigInt` modular exponentiation. Verified against
 * `crypto.publicEncrypt`/`privateDecrypt` round trips through a throwaway keypair in
 * `tests/services.qimei-crypto.test.ts` — there is no private key for the real QIMEI bootstrap key
 * to check a *specific* ciphertext against, since PKCS1v1.5 padding is randomised per call anyway.
 */
const rsaesPkcs1Encrypt = (message, modulusHex, exponent) => {
    const modulus = BigInt(`0x${modulusHex}`);
    const k = modulusHex.length / 2;
    if (message.length > k - 11)
        throw new Error('RSAES-PKCS1-v1_5 payload too long for this key');
    const paddingLength = k - message.length - 3;
    const padding = new Uint8Array(paddingLength);
    // PKCS#1 v1.5 padding bytes must be nonzero; resample any zero bytes a batch happens to draw.
    let filled = 0;
    while (filled < paddingLength) {
        const batch = globalThis.crypto.getRandomValues(new Uint8Array(paddingLength - filled));
        for (const byte of batch)
            if (byte !== 0)
                padding[filled++] = byte;
    }
    const block = new Uint8Array(k);
    block[1] = 0x02;
    block.set(padding, 2);
    block[2 + paddingLength] = 0x00;
    block.set(message, 3 + paddingLength);
    const encoded = modPow(BigInt(`0x${Buffer$1.from(block).toString('hex')}`), exponent, modulus);
    let hex = encoded.toString(16);
    if (hex.length % 2 === 1)
        hex = `0${hex}`;
    const cipherBytes = Buffer$1.from(hex, 'hex');
    return cipherBytes.length === k
        ? cipherBytes
        : Buffer$1.concat([Buffer$1.alloc(k - cipherBytes.length), cipherBytes]);
};
const rsaEncryptQimeiKey = (message) => rsaesPkcs1Encrypt(message, QIMEI_RSA_MODULUS_HEX, QIMEI_RSA_EXPONENT);
/**
 * AES-CBC has a native Web Crypto primitive, unlike MD5 and RSAES-PKCS1-v1_5 above, so this one is
 * not hand-rolled — just adapted to `subtle`'s Promise-based shape. Matches `node:crypto`'s
 * `createCipheriv('aes-128-cbc', key, iv)` byte-for-byte, PKCS7 padding included (also verified in
 * `tests/services.qimei-crypto.test.ts`).
 */
const aesCbcEncrypt = async (key, iv, plaintext) => {
    // `Uint8Array.from` rather than the inputs directly: `subtle` requires `Uint8Array<ArrayBuffer>`,
    // and a `Buffer` (or anything else backed by `ArrayBufferLike`) does not satisfy that on its own.
    const keyBytes = Uint8Array.from(key);
    const cryptoKey = await globalThis.crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt']);
    const encrypted = await globalThis.crypto.subtle.encrypt({ name: 'AES-CBC', iv: Uint8Array.from(iv) }, cryptoKey, Uint8Array.from(plaintext));
    return Buffer$1.from(encrypted);
};
/** The QIMEI protocol's own AES step: the same 16 bytes serve as both the key and the IV. */
const aesEncryptQimeiPayload = (key, plaintext) => aesCbcEncrypt(key, key, plaintext);
const buildQimeiRequest = async (device, now = new Date()) => {
    const cryptKey = randomHex(16);
    const nonce = randomHex(16);
    const timestamp = Math.floor(now.getTime() / 1000);
    // The 16-*character* hex string above, re-encoded as UTF-8 bytes, is the 16-byte key material —
    // not a hex-decoded byte string. That is the exact input shape the original `Buffer.from(cryptKey)`
    // (default UTF-8 encoding) produced, and the upstream protocol expects it unchanged.
    const keyBytes = Buffer$1.from(cryptKey);
    const encryptedKey = rsaEncryptQimeiKey(keyBytes);
    const encryptedPayload = await aesEncryptQimeiPayload(keyBytes, Buffer$1.from(JSON.stringify(buildQimeiPayload(device, now))));
    const key = encryptedKey.toString('base64');
    const params = encryptedPayload.toString('base64');
    const extra = `{"appKey":"${QIMEI_APP_KEY}"}`;
    return {
        headers: {
            Host: 'api.tencentmusic.com',
            method: 'GetQimei',
            service: 'trpc.tme_datasvr.qimeiproxy.QimeiProxy',
            appid: 'qimei_qq_android',
            sign: md5('qimei_qq_androidpzAuCmaFAaFaHrdakPjLIEqKrGnSOOvH', String(timestamp)),
            'user-agent': 'QQMusic',
            timestamp: String(timestamp),
        },
        body: {
            app: 0,
            os: 1,
            qimeiParams: {
                key,
                params,
                time: String(timestamp),
                nonce,
                sign: md5(key, params, String(timestamp * 1000), nonce, QIMEI_SECRET, extra),
                extra,
            },
        },
    };
};
const credentialMusicId = (credential) => {
    const stringId = identifierOf(credential.str_musicid).trim();
    const rawId = identifierOf(credential.musicid).trim();
    return ((stringId && stringId !== '0' ? stringId : '') ||
        (rawId && rawId !== '0' ? rawId : '') ||
        stringId ||
        rawId);
};
const buildAndroidComm = (device, credential, overrides = {}) => ({
    ct: 11,
    cv: 14090008,
    v: 14090008,
    chid: CHANNEL_ID,
    tmeAppID: 'qqmusic',
    QIMEI: device.qimei ?? '',
    QIMEI36: device.qimei36 ?? '',
    OpenUDID: device.openUdid,
    udid: device.openUdid,
    OpenUDID2: device.openUdid,
    aid: device.androidId,
    os_ver: device.osRelease,
    phonetype: device.model,
    devicelevel: String(device.sdk),
    newdevicelevel: String(device.sdk),
    rom: device.fingerprint,
    ...(device.sessionUid ? { uid: device.sessionUid } : {}),
    ...(device.sessionSid ? { sid: device.sessionSid } : {}),
    ...(credential
        ? {
            qq: credentialMusicId(credential),
            authst: credential.musickey,
            tmeLoginType: credential.loginType,
        }
        : {}),
    ...overrides,
});

// src/services/auth/musicuProtocol.ts
// 从认证入口搬出的同一套实现；协议、状态与对外回包沿用原规则。
const MUSICU_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
class QrLoginServiceError extends Error {
    httpStatus;
    retryAfterMs;
    upstreamCode;
    diagnostics;
    constructor(message, httpStatus, retryAfterMs, upstreamCode, diagnostics = {}) {
        super(message);
        this.httpStatus = httpStatus;
        this.retryAfterMs = retryAfterMs;
        this.upstreamCode = upstreamCode;
        this.diagnostics = diagnostics;
        this.name = 'QrLoginServiceError';
    }
}
/**
 * QIMEI bootstrap rejection. Only the upstream numeric codes are carried; they are opaque
 * security codes and must never be renamed into an official error meaning.
 */
class QqDeviceBootstrapError extends Error {
    httpStatus;
    outerCode;
    innerCode;
    constructor(httpStatus, outerCode, innerCode) {
        super(`QIMEI bootstrap failed (HTTP ${httpStatus}, outer=${outerCode ?? 'unknown'}, inner=${innerCode ?? 'unknown'})`);
        this.httpStatus = httpStatus;
        this.outerCode = outerCode;
        this.innerCode = innerCode;
        this.name = 'QqDeviceBootstrapError';
    }
}
class QqProtocolError extends Error {
    phase;
    upstreamCode;
    globalCode;
    httpStatus;
    constructor(phase, upstreamCode, globalCode, httpStatus) {
        super(`${phase} failed (HTTP ${httpStatus}, global=${globalCode}, code=${upstreamCode ?? 'unknown'})`);
        this.phase = phase;
        this.upstreamCode = upstreamCode;
        this.globalCode = globalCode;
        this.httpStatus = httpStatus;
        this.name = 'QqProtocolError';
    }
}
/** The cookie form of a credential, accepted by both the musicu RPC face and the legacy CGIs. */
const credentialCookieHeader = (credential) => {
    const musicid = identifierOf(credential.str_musicid) || String(credential.musicid);
    return [
        `uin=${musicid}`,
        `qqmusic_uin=${musicid}`,
        `qm_keyst=${credential.musickey}`,
        `qqmusic_key=${credential.musickey}`,
    ].join('; ');
};
const callMusicu = async (http, device, phase, module, method, param, credential, overrides = {}) => {
    const credentialCookies = credential ? credentialCookieHeader(credential) : '';
    const response = await http.post(MUSICU_URL, {
        comm: buildAndroidComm(device, credential, overrides),
        req_0: { module, method, param },
    }, {
        headers: {
            'User-Agent': `QQMusic 14090008(android ${device.osRelease})`,
            ...(credentialCookies ? { Cookie: credentialCookies } : {}),
        },
    });
    const body = dictionaryOf(response.data);
    const item = dictionaryOf(body.req_0);
    const globalCode = numberOf(body.code) ?? 0;
    const upstreamCode = numberOf(item.code);
    logger.info('qq-auth.upstream-result', {
        phase,
        httpStatus: response.status,
        globalCode,
        upstreamCode,
    });
    if (!Object.keys(item).length || globalCode !== 0 || (upstreamCode ?? 0) !== 0) {
        throw new QqProtocolError(phase, upstreamCode, globalCode, response.status);
    }
    return dictionaryOf(item.data);
};

// src/services/auth/bootstrap.ts
// 从认证入口搬出的同一套实现；协议、状态与对外回包沿用原规则。
const QIMEI_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * QIMEI rejects a request whose signed timestamp is more than about five minutes away from the
 * server clock (HTTP 200, outer code -30000). A rejection is retried once, signed with the
 * server's time, when the local clock is more than this threshold (one minute) off. The `Date`
 * header only has second precision, so anything below a minute is treated as an accurate clock.
 */
const QIMEI_CLOCK_SKEW_RETRY_MS = 60 * 1000;
const buildQimeiHeadersAndBody = async (device, signedAt = new Date()) => {
    const request = await buildQimeiRequest(device, signedAt);
    const rawHeaders = dictionaryOf(request.headers);
    const headers = Object.fromEntries(Object.entries(rawHeaders).filter((entry) => typeof entry[1] === 'string'));
    return { headers, body: dictionaryOf(request.body) };
};
/**
 * Server time minus `localNow`, from the response `Date` header; undefined when there is none.
 * Approximate: it also carries the time spent building and sending the request, and the header's
 * truncation to whole seconds. Both are far below `QIMEI_CLOCK_SKEW_RETRY_MS`.
 */
const serverClockSkewMs = (headers, localNow) => {
    const date = dictionaryOf(headers).date;
    const serverAt = typeof date === 'string' ? Date.parse(date) : Number.NaN;
    return Number.isFinite(serverAt) ? serverAt - localNow : undefined;
};
/**
 * One QIMEI round trip signed at `signedAt`, logged at code/type/length granularity.
 * `localNow` is the local clock reading the bootstrap started from, not the send time, so the
 * retry's logged skew also includes the first round trip.
 */
const requestQimei = async (http, device, localNow, signedAt) => {
    const request = await buildQimeiHeadersAndBody(device, new Date(signedAt));
    const response = await http.post(QIMEI_URL, request.body, { headers: request.headers });
    const outer = parseDictionary(response.data);
    const inner = parseDictionary(outer.data);
    const data = dictionaryOf(inner.data);
    const result = {
        httpStatus: response.status,
        qimei: stringOf(data.q16),
        qimei36: stringOf(data.q36),
        outerCode: numberOf(outer.code),
        innerCode: numberOf(inner.code),
        clockSkewMs: serverClockSkewMs(response.headers, localNow),
    };
    logger.info('qq-auth.qimei-result', {
        source: 'upstream',
        httpStatus: result.httpStatus,
        outerCode: result.outerCode,
        outerDataType: typeof outer.data,
        innerCode: result.innerCode,
        q16Length: result.qimei.length,
        q36Length: result.qimei36.length,
        signedWith: signedAt === localNow ? 'local-clock' : 'server-clock',
        clockSkewSec: result.clockSkewMs === undefined ? undefined : Math.round(result.clockSkewMs / 1000),
    });
    return result;
};
/**
 * Reuses the stored QIMEI while it is fresh and returns whether the device context changed.
 * Diagnostics stay at code/type/length granularity: raw bodies and identifiers never leave
 * this function.
 *
 * `now` is also the clock the first request is signed with (it used to be a fresh `new Date()`),
 * so a host or test that injects a fixed clock signs with that clock. Production hosts inject
 * `Date.now`, where the two are the same.
 *
 * A rejection while the local clock is off from the server's by more than
 * `QIMEI_CLOCK_SKEW_RETRY_MS` is retried once with the server's time. Nothing about the skew
 * is stored: the QIMEI it buys is cached for a day, so the next bootstrap pays the retry again
 * at most once a day.
 */
const ensureQimei = async (http, device, now) => {
    const fresh = device.qimei &&
        device.qimei36 &&
        device.qimeiSavedAt &&
        now - device.qimeiSavedAt < QIMEI_TTL_MS;
    if (fresh) {
        logger.info('qq-auth.qimei-result', { source: 'cache' });
        return false;
    }
    let result = await requestQimei(http, device, now, now);
    const rejected = !result.qimei || !result.qimei36;
    const skewMs = result.clockSkewMs;
    if (rejected && skewMs !== undefined && Math.abs(skewMs) > QIMEI_CLOCK_SKEW_RETRY_MS) {
        result = await requestQimei(http, device, now, now + skewMs);
    }
    if (!result.qimei || !result.qimei36)
        throw new QqDeviceBootstrapError(result.httpStatus, result.outerCode, result.innerCode);
    device.qimei = result.qimei;
    device.qimei36 = result.qimei36;
    device.qimeiSavedAt = now;
    return true;
};
const refreshAndroidSession = async (http, device) => {
    const data = await callMusicu(http, device, 'get-session', 'music.getSession.session', 'GetSession', {
        uid: device.sessionUid ?? '',
        vkey: 0,
        caller: 0,
    });
    const session = dictionaryOf(data.session);
    const uid = identifierOf(session.uid);
    const sid = identifierOf(session.sid);
    if (!uid || !sid)
        throw new Error('GetSession response missing uid/sid');
    device.sessionUid = uid;
    device.sessionSid = sid;
    device.sessionVkey = session.vkey;
};
const createNativeQr = async (http, device) => {
    const data = await callMusicu(http, device, 'create-qr', 'music.login.LoginServer', 'CreateQRCode', {
        tmeAppID: 'qqmusic',
        ct: 11,
        cv: 14090008,
    }, undefined, { ct: 23, cv: 0 });
    const qrcodeId = stringOf(data.qrcodeID);
    const encoded = stringOf(data.qrcode).split(',').at(-1) ?? '';
    const image = Buffer$1.from(encoded, 'base64');
    if (!qrcodeId || image.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
        throw new Error('CreateQRCode response missing a valid PNG/qrcodeID');
    }
    return {
        qrcodeId,
        imageUrl: `data:image/png;base64,${image.toString('base64')}`,
        expiresIn: numberOf(data.expiresIn),
    };
};

// src/services/auth/qrDiagnostics.ts
const attempts = new WeakMap();
let nextAttemptId = 0;
const COOKIE_NAME = /^[A-Za-z0-9_]{1,40}$/;
const COOKIE_NAME_LIMIT = 20;
/**
 * 手机 QQ 扫码通道收到 MQTT `cookies` 时，只记录 cookie 名称和 `tmeLoginType` 的数字。
 * 用来分辨用 QQ 音乐 App 扫码时回调内容跟手机 QQ 有什么不同；任何 cookie 的值都不记录。
 */
const logQqCookies = (payload) => {
    try {
        const body = payload !== null && typeof payload === 'object' ? payload : {};
        const cookies = body.cookies !== null && typeof body.cookies === 'object' && !Array.isArray(body.cookies)
            ? body.cookies
            : {};
        const cookieNames = Object.keys(cookies)
            .filter((name) => COOKIE_NAME.test(name))
            .sort()
            .slice(0, COOKIE_NAME_LIMIT);
        const entry = cookies.tmeLoginType;
        const raw = entry !== null && typeof entry === 'object'
            ? entry.value
            : undefined;
        const tmeLoginType = typeof raw === 'number' && Number.isSafeInteger(raw)
            ? raw
            : typeof raw === 'string' && /^\d{1,3}$/.test(raw)
                ? Number(raw)
                : undefined;
        logger.info('qq-auth.qq-cookies', {
            loginChannel: 'qq',
            cookieNames,
            ...(tmeLoginType === undefined ? {} : { tmeLoginType }),
            hasCommConf: body.commConf !== null && typeof body.commConf === 'object',
        });
    }
    catch {
        // Optional host log sinks must never turn a valid login into a failure.
    }
};
/** A process-local counter correlates one attempt without deriving anything from a QR or account. */
const logWechatQr = (session, event, fields) => {
    if (session.channel !== 'wechat')
        return;
    let attemptId = attempts.get(session);
    if (attemptId === undefined) {
        attemptId = ++nextAttemptId;
        attempts.set(session, attemptId);
    }
    try {
        logger.info(`qq-auth.wechat-${event}`, { attemptId, loginChannel: 'wechat', ...fields });
    }
    catch {
        // Optional host log sinks must never turn a valid poll or login into a failure.
    }
};

// src/protocol/loginHints.ts
//
// 扫码登录失败时给使用者看的原因（`failureHint`）。只从已经验证过的诊断字段推，不改任何原有字段。
// 手机 QQ 换凭证失败后会用扫码票据再验证一次，真正的原因在 `primaryFailure`，所以先看它再看顶层。
// 「扫错 App」没有受控实验，文案写成建议而不是断言。文案是英文预设，前端可以按 key 换成自己的。
// 零依赖，两个运行时共用。
const LOGIN_HINT_MESSAGES = {
    'login.device-limit': 'This account has reached its login device limit. Remove an old device in the QQ Music app, then try again.',
    'login.wrong-scan-app': 'If you scanned with the QQ Music app, try again and scan with the mobile QQ app instead.',
    'login.rate-limited': 'Too many login attempts. Wait a moment and try again.',
    'login.account-restricted': 'This account is restricted and cannot log in right now.',
    'login.account-banned': 'This account has been banned.',
    'login.account-binding': 'There is a problem with how this account is linked. Check it in the QQ Music app.',
    'login.rejected': 'QQ Music rejected this login. Please try again.',
};
const DEVICE_LIMIT_CODE = 20279;
const RATE_LIMITED_CODE = 104604;
/** 手机 QQ 换凭证时实测见过的码（用 QQ 音乐 App 扫码时出现），含义没有受控验证。 */
const WRONG_SCAN_APP_CODE = 50006;
const BY_ERROR_KEY = {
    'auth.device-limit': 'login.device-limit',
    'auth.rate-limited': 'login.rate-limited',
    'auth.account-restricted': 'login.account-restricted',
    'auth.account-banned': 'login.account-banned',
    'auth.account-binding': 'login.account-binding',
    'auth.login-rejected': 'login.rejected',
};
const hint$1 = (key) => ({ key, message: LOGIN_HINT_MESSAGES[key] });
const byCodeOrKey = (code, errorKey) => {
    if (code === DEVICE_LIMIT_CODE)
        return hint$1('login.device-limit');
    if (code === RATE_LIMITED_CODE)
        return hint$1('login.rate-limited');
    const key = errorKey === undefined ? undefined : BY_ERROR_KEY[errorKey];
    return key === undefined ? undefined : hint$1(key);
};
/** 认不出的失败（取消、过期、网络、未知码）不给提示。 */
const loginFailureHintOf = (details) => {
    const primary = details.primaryFailure;
    if (primary) {
        const fromPrimary = byCodeOrKey(primary.upstreamCode, primary.upstreamErrorKey);
        if (fromPrimary)
            return fromPrimary;
        if (details.fallbackAttempted === true && primary.upstreamCode === WRONG_SCAN_APP_CODE)
            return hint$1('login.wrong-scan-app');
    }
    if (details.upstreamHttpStatus === 429)
        return hint$1('login.rate-limited');
    // 上游 HTTP 本身失败时，单项码不可信。
    if (details.upstreamHttpStatus !== undefined && details.upstreamHttpStatus >= 400)
        return undefined;
    return byCodeOrKey(details.upstreamCode, details.upstreamErrorKey);
};

/** 只有含义已登记、证据不止是见过响应的错误键才公开。 */
const isExposedEntry = (entry) => entry.errorKey !== 'upstream.unknown' &&
    entry.errorKey !== 'upstream.unclassified' &&
    entry.evidence !== 'observed-response' &&
    entry.evidence !== 'unknown';
/** 可以出现在对外响应中的错误键，也用于校验还原的记录。 */
const EXPOSED_UPSTREAM_ERROR_KEYS = new Set(UPSTREAM_CODES.filter(isExposedEntry).map((entry) => entry.errorKey));
const isExposedUpstreamErrorKey = (value) => typeof value === 'string' && EXPOSED_UPSTREAM_ERROR_KEYS.has(value);
/** 调用、层级、数字都匹配且证据足够才给错误键；未知情况不推断。 */
const exposedUpstreamErrorKeyOf = (operation, sourceLayer, upstreamCode) => {
    const entry = UPSTREAM_CODES.find((candidate) => candidate.operation === operation &&
        candidate.sourceLayer === sourceLayer &&
        candidate.upstreamCode === upstreamCode);
    return entry && isExposedEntry(entry) ? entry.errorKey : undefined;
};

// WeChat QR login channel (`tmeLoginType: 1`).
//
// This is the *web* OAuth flow: open.weixin.qq.com hands out a QR whose confirmation yields a
// WeChat OAuth `code`, which is then swapped for a QQ Music credential. It shares nothing with
// the mobile QQ channel (`tmeLoginType: 6`, MQTT over WSS) beyond that final musicu call,
// which stays in `qrLogin.ts` because it needs the Android device context that these endpoints
// must NOT receive.
//
// Endpoints, the appid and the status codes below are third-party reverse-engineered protocol
// facts (inspected 2026-08-03). They are NOT official Tencent definitions. Unrecognised
// upstream numbers stay opaque safe codes and are never renamed into an official error meaning.
//
// This module must not import anything from `qrLogin.ts` at runtime (type-only imports are
// erased): `qrLogin.ts` imports this file, and a runtime cycle would break module init.
const WECHAT_APP_ID = 'wx48db31d50e334801';
const WECHAT_LOGIN_TYPE = 1;
const CONNECT_URL = 'https://open.weixin.qq.com/connect/qrconnect';
const IMAGE_URL_PREFIX = 'https://open.weixin.qq.com/connect/qrcode/';
const POLL_URL = 'https://lp.open.weixin.qq.com/connect/l/qrconnect';
const REDIRECT_URI = 'https://y.qq.com/portal/wx_redirect.html?login_type=2&surl=https://y.qq.com/';
const STYLE_HREF = 'https://y.qq.com/mediastyle/music_v17/src/css/popup_wechat.css#wechat_redirect';
const POLL_REFERER = 'https://open.weixin.qq.com/';
const UUID_PATTERN = /uuid=(.+?)"/;
const STATUS_PATTERN = /window\.wx_errcode=(\d+);window\.wx_code='([^']*)'/;
const PNG_MAGIC = '89504e470d0a1a0a';
const JPEG_MAGIC = 'ffd8ff';
/**
 * How long one long poll may hold the connection. The upstream keeps it open until the QR state
 * changes, so the caller's budget — not a fixed interval — is what bounds a `check`.
 */
const WECHAT_DEFAULT_POLL_BUDGET_MS = 1500;
const MAX_CONSECUTIVE_POLL_ERRORS = 3;
/**
 * `window.wx_errcode` values. The reference pairs each state with its QQ `ptuiCB` counterpart;
 * only the WeChat column is used here.
 */
const WECHAT_STATUS = {
    waiting: 408,
    scanned: 404,
    confirmed: 405,
    expired: 402,
    refused: 403,
};
/**
 * A WeChat channel failure that still carries the upstream number as an opaque safe code.
 */
class WechatQrError extends Error {
    upstreamCode;
    constructor(message, upstreamCode) {
        super(message);
        this.upstreamCode = upstreamCode;
        this.name = 'WechatQrError';
    }
}
const textOf = (value) => (typeof value === 'string' ? value : '');
const bufferOf = (value) => {
    if (Buffer$1.isBuffer(value))
        return value;
    if (value instanceof ArrayBuffer)
        return Buffer$1.from(value);
    if (ArrayBuffer.isView(value))
        return Buffer$1.from(value.buffer, value.byteOffset, value.byteLength);
    return Buffer$1.alloc(0);
};
const imageMimetype = (image) => {
    const head = image.subarray(0, 8).toString('hex');
    if (head.startsWith(PNG_MAGIC))
        return 'image/png';
    if (head.startsWith(JPEG_MAGIC))
        return 'image/jpeg';
    return null;
};
/**
 * Merges the caller's abort signal with a deadline. Both runtimes this package targets ship
 * `AbortSignal.any` and `AbortSignal.timeout`, so an upstream request never outlives its budget.
 */
const budgetSignal = (budgetMs, signal) => {
    if (budgetMs === undefined)
        return signal;
    const deadline = AbortSignal.timeout(Math.max(1, budgetMs));
    return signal ? AbortSignal.any([signal, deadline]) : deadline;
};
/**
 * Fetches the QR image for a `uuid` already obtained from `createWechatQr`, as an inline data URL.
 * Split out so a caller that already knows the `uuid` — a serverless invocation reconstructing a
 * session from a sealed `unikey`, which never carries the image itself — can re-fetch just the
 * image without minting a second, different WeChat QR through a new `qrconnect` call.
 */
const fetchWechatQrImage = async (http, uuid, options = {}) => {
    const image = await http.request({
        url: `${IMAGE_URL_PREFIX}${uuid}`,
        method: 'GET',
        headers: { Referer: CONNECT_URL },
        responseType: 'arraybuffer',
        signal: options.signal,
    });
    const bytes = bufferOf(image.data);
    const mimetype = imageMimetype(bytes);
    if (!mimetype)
        throw new WechatQrError('WeChat QR response is not a PNG/JPEG image');
    logger.info('qq-auth.wechat-qr-image-fetched', {
        qrIdentifierLength: uuid.length,
        imageBytes: bytes.length,
        mimetype,
    });
    return `data:${mimetype};base64,${bytes.toString('base64')}`;
};
/**
 * Requests a WeChat QR and returns its `uuid` plus an inline data URL, so the transport keeps
 * handing the client a self-contained image exactly like the App channel does.
 */
const createWechatQr = async (http, options = {}) => {
    const page = await http.request({
        url: CONNECT_URL,
        method: 'GET',
        params: {
            appid: WECHAT_APP_ID,
            redirect_uri: REDIRECT_URI,
            response_type: 'code',
            scope: 'snsapi_login',
            state: 'STATE',
            href: STYLE_HREF,
        },
        responseType: 'text',
        signal: options.signal,
    });
    const uuid = UUID_PATTERN.exec(textOf(page.data))?.[1] ?? '';
    if (!uuid)
        throw new WechatQrError('WeChat qrconnect response missing uuid');
    return { identifier: uuid, imageUrl: await fetchWechatQrImage(http, uuid, options) };
};
/**
 * One long-poll of the WeChat QR state. The endpoint holds the connection open until the state
 * changes, so the caller does not need to poll aggressively.
 */
const pollWechatQr = async (http, uuid, options = {}) => {
    const response = await http.request({
        url: POLL_URL,
        method: 'GET',
        params: { uuid, _: String(Date.now()) },
        headers: { Referer: POLL_REFERER },
        responseType: 'text',
        signal: budgetSignal(options.budgetMs, options.signal),
    });
    const match = STATUS_PATTERN.exec(textOf(response.data));
    if (!match)
        throw new WechatQrError('WeChat poll response missing wx_errcode');
    return { upstreamCode: Number(match[1]), code: match[2] };
};
/**
 * Maps one poll result onto the event vocabulary the App channel listener uses, so the session
 * state machine stays channel-agnostic.
 */
const eventForWechatStatus = (status) => {
    switch (status.upstreamCode) {
        case WECHAT_STATUS.waiting:
            return { type: 'waiting', payload: null };
        case WECHAT_STATUS.scanned:
            return { type: 'scanned', payload: null };
        case WECHAT_STATUS.confirmed:
            return { type: 'authorized', payload: { code: status.code } };
        case WECHAT_STATUS.expired:
            return { type: 'timeout', payload: null };
        case WECHAT_STATUS.refused:
            return { type: 'canceled', payload: null };
        default:
            throw new WechatQrError('Unrecognised WeChat QR status', status.upstreamCode);
    }
};

// src/services/auth/qrFailures.ts
// 从认证入口搬出的同一套实现；协议、状态与对外回包沿用原规则。
const terminalState = (state) => ['confirmed', 'expired', 'failed'].includes(state);
/**
 * States where the user is already acting on this QR from their phone. A second login attempt must
 * not pull the rug out from under that, so these keep the 409; every other non-terminal state is an
 * abandoned code and is preemptible. `confirmed` is deliberately absent: it is terminal, it never
 * blocked a new session, and blocking it would 409 anyone who signs out and back in inside the TTL.
 */
const confirmingState = (state) => ['scanned', 'exchanging'].includes(state);
/** Keeps whatever opaque number the upstream gave us, whichever channel produced the failure. */
const upstreamCodeOf = (error) => {
    if (error instanceof QqProtocolError)
        return error.upstreamCode;
    if (error instanceof WechatQrError)
        return error.upstreamCode;
    return undefined;
};
/** Which registered call each login step (`QqProtocolError.phase`) is, per channel. */
const LOGIN_UPSTREAM_OPERATIONS = {
    qq: {
        'credential-exchange': 'login.qq.credential-exchange',
        'get-login-user': 'login.qq.fallback-validation',
    },
    wechat: {
        'credential-exchange': 'login.wechat.credential-exchange',
        'get-login-user': 'login.wechat.credential-validation',
        'credential-refresh': 'login.wechat.credential-refresh',
    },
};
/**
 * A login failure's optional key. An HTTP failure or a non-zero gateway code takes precedence, so
 * only a business code from an otherwise healthy response counts, and then only when channel, step
 * and number all match a registered entry with a source.
 */
const loginUpstreamErrorKeyOf = (error, channel) => {
    if (!channel || !(error instanceof QqProtocolError) || error.upstreamCode === undefined)
        return undefined;
    if (error.httpStatus < 200 || error.httpStatus > 299 || error.globalCode !== 0)
        return undefined;
    const operations = LOGIN_UPSTREAM_OPERATIONS[channel];
    const operation = Object.hasOwn(operations, error.phase) ? operations[error.phase] : undefined;
    return operation
        ? exposedUpstreamErrorKeyOf(operation, 'business', error.upstreamCode)
        : undefined;
};
/** Only stable, non-sensitive error categories cross the API boundary. */
const qrFailureReasonOf = (error) => {
    const status = upstreamHttpStatusOf(error);
    if (status !== undefined && status >= 400)
        return 'upstream-http-error';
    if (error instanceof QqProtocolError ||
        error instanceof WechatQrError ||
        error instanceof QqDeviceBootstrapError)
        return 'upstream-rejected';
    const message = error instanceof Error ? error.message : '';
    const knownMessages = {
        'MQTT WebSocket error': 'mqtt-websocket-error',
        'MQTT WebSocket closed': 'mqtt-websocket-closed',
        'MQTT packet timeout': 'mqtt-packet-timeout',
        'MQTT handshake timeout': 'mqtt-handshake-timeout',
        'MQTT handshake failed': 'mqtt-handshake-failed',
        'MQTT cookies missing login credential': 'missing-credential',
    };
    if (Object.hasOwn(knownMessages, message))
        return knownMessages[message];
    const record = dictionaryOf(error);
    const code = record.code ?? dictionaryOf(record.cause).code;
    if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))
        return 'network-timeout';
    if (code === 'ETIMEDOUT' || code === 'ECONNABORTED')
        return 'network-timeout';
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN')
        return 'dns-error';
    if (code === 'ECONNRESET')
        return 'connection-reset';
    if (code === 'ECONNREFUSED')
        return 'connection-refused';
    if (code === 'ERR_NETWORK')
        return 'network-error';
    return 'unexpected-error';
};
const safeDiagnosticNumber = (value) => typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
const upstreamHttpStatusOf = (error) => {
    const record = dictionaryOf(error);
    const status = safeDiagnosticNumber(record.httpStatus ?? dictionaryOf(record.response).status);
    return status !== undefined && status >= 100 && status <= 599 ? status : undefined;
};
const QR_FAILURE_STAGES = new Set([
    'qr-key',
    'device-bootstrap',
    'session-bootstrap',
    'qr-create',
    'mqtt-listener',
    'qr-poll',
    'qr-event',
    'credential-payload',
    'credential-exchange',
    'credential-validation',
    'session-issue',
]);
const QR_FAILURE_REASONS = new Set([
    'local-backoff',
    'session-busy',
    'upstream-http-error',
    'upstream-rejected',
    'mqtt-websocket-error',
    'mqtt-websocket-closed',
    'mqtt-packet-timeout',
    'mqtt-handshake-timeout',
    'mqtt-handshake-failed',
    'missing-credential',
    'network-timeout',
    'dns-error',
    'connection-reset',
    'connection-refused',
    'network-error',
    'login-rejected',
    'user-canceled',
    'qr-timeout',
    'unexpected-error',
]);
const knownStage = (value) => typeof value === 'string' && QR_FAILURE_STAGES.has(value) ? value : undefined;
const knownReason = (value) => typeof value === 'string' && QR_FAILURE_REASONS.has(value)
    ? value
    : undefined;
/** Keeps only the validated fields; a record with none of them left is dropped entirely. */
const primaryFailureFieldsOf = (source) => {
    const record = dictionaryOf(source);
    const fields = {
        failureStage: knownStage(record.failureStage),
        failureReason: knownReason(record.failureReason),
        upstreamCode: safeDiagnosticNumber(record.upstreamCode),
        upstreamErrorKey: isExposedUpstreamErrorKey(record.upstreamErrorKey)
            ? record.upstreamErrorKey
            : undefined,
    };
    return Object.values(fields).some((value) => value !== undefined) ? fields : undefined;
};
/** Restored records are untrusted. Select and validate only public diagnostic fields. */
const failureDetailsOf = (source) => {
    const details = {
        failureStage: knownStage(source.failureStage),
        failureReason: knownReason(source.failureReason),
        upstreamHttpStatus: upstreamHttpStatusOf({ httpStatus: source.upstreamHttpStatus }),
        upstreamCode: safeDiagnosticNumber(source.upstreamCode),
        upstreamGlobalCode: safeDiagnosticNumber(source.upstreamGlobalCode),
        upstreamSubCode: safeDiagnosticNumber(source.upstreamSubCode),
    };
    // The newer fields are added only when present, so a failure without them keeps exactly the
    // keys it always had.
    if (isExposedUpstreamErrorKey(source.upstreamErrorKey))
        details.upstreamErrorKey = source.upstreamErrorKey;
    const primaryFailure = primaryFailureFieldsOf(source.primaryFailure);
    if (primaryFailure)
        details.primaryFailure = primaryFailure;
    if (source.fallbackAttempted === true)
        details.fallbackAttempted = true;
    // Always derived from the validated fields, never copied from a restored record.
    const failureHint = loginFailureHintOf(details);
    if (failureHint)
        details.failureHint = failureHint;
    return details;
};
const qrFailureDetailsOf = (error, stage, channel) => {
    const details = {
        failureStage: stage,
        failureReason: qrFailureReasonOf(error),
        upstreamHttpStatus: upstreamHttpStatusOf(error),
        upstreamCode: safeDiagnosticNumber(error instanceof QqDeviceBootstrapError ? error.outerCode : upstreamCodeOf(error)),
        upstreamGlobalCode: error instanceof QqProtocolError ? safeDiagnosticNumber(error.globalCode) : undefined,
        upstreamSubCode: error instanceof QqDeviceBootstrapError ? safeDiagnosticNumber(error.innerCode) : undefined,
    };
    const upstreamErrorKey = loginUpstreamErrorKeyOf(error, channel);
    if (upstreamErrorKey)
        details.upstreamErrorKey = upstreamErrorKey;
    return details;
};
/** What a primary step failed with, in the shape `primaryFailure` carries. */
const primaryFailureOf = (error, stage, channel) => {
    const failure = {
        failureStage: stage,
        failureReason: qrFailureReasonOf(error),
        upstreamCode: safeDiagnosticNumber(upstreamCodeOf(error)),
    };
    const upstreamErrorKey = loginUpstreamErrorKeyOf(error, channel);
    if (upstreamErrorKey)
        failure.upstreamErrorKey = upstreamErrorKey;
    return failure;
};

// src/services/auth/qrDrivers.ts
// 从认证入口搬出的同一套实现；协议、状态与对外回包沿用原规则。
/**
 * `qq` is a push channel: the MQTT listener started here delivers events the instant they
 * arrive, which is what keeps this channel's timing identical to the pre-driver implementation.
 * `advance()` therefore has nothing left to observe.
 */
const createQqQrDriver = (options) => {
    const listeners = new Map();
    return {
        mode: 'push',
        createQr: async () => {
            const qr = await createNativeQr(options.http, options.device());
            return { identifier: qr.qrcodeId, imageUrl: qr.imageUrl, expiresIn: qr.expiresIn };
        },
        start: (session, context) => {
            const listener = options.listen(session.identifier ?? '', context.onEvent, context.timeoutMs);
            listeners.set(session.key, listener);
            return listener;
        },
        advance: async () => [],
        close: (session) => {
            listeners.get(session.key)?.close();
            listeners.delete(session.key);
        },
    };
};
/**
 * `qq` as a *pull* channel, for serverless runtimes. Same upstream protocol as the push driver
 * above; the difference is only who holds the socket — a relay does, and each `advance()` drains
 * what it has collected.
 */
const createRelayQqQrDriver = (options) => {
    const now = options.now ?? Date.now;
    return {
        mode: 'pull',
        createQr: async (session) => {
            // A session reconstructed from a sealed key already has its `qrcodeID`. Calling
            // `CreateQRCode` again would mint a *second, different* code upstream, orphaning both the
            // relay's subscription and the identifier sealed into the key the client is holding — the
            // same hazard `createWechatQrDriver` documents, with a worse failure mode: the code on
            // screen would simply never resolve. Only the image is re-fetched.
            if (session.identifier) {
                return {
                    identifier: session.identifier,
                    imageUrl: await options.relay.image(session.identifier),
                };
            }
            const qr = await createNativeQr(options.http, options.device());
            // Subscribed before the image is returned, never after: see `createMqttListenOver`.
            await options.relay.open(qr.qrcodeId, qr.imageUrl, Math.max(0, session.expiresAt - now()));
            return { identifier: qr.qrcodeId, imageUrl: qr.imageUrl, expiresIn: qr.expiresIn };
        },
        advance: async (session, budgetMs) => session.identifier ? options.relay.poll(session.identifier, budgetMs) : [],
        // `close` is synchronous by contract, so this is the best-effort path only. The route that has
        // to *guarantee* the socket is released — `/login/qr/cancel`, where the cost of a leak is a
        // relay billed for the rest of the QR's life — awaits `relay.close` itself.
        close: (session) => {
            if (session.identifier)
                void options.relay.close(session.identifier).catch(() => undefined);
        },
    };
};
/**
 * `wechat` is a pull channel: every `advance()` is one time-boxed long poll and nothing runs
 * between calls. A closed dialog therefore stops polling immediately instead of holding a loop
 * open for the rest of the QR's life, and a serverless invocation can serve the channel at all.
 */
const createWechatQrDriver = (options) => ({
    mode: 'pull',
    createQr: async (session, signal) => {
        // A session reconstructed from a sealed `unikey` already carries the `uuid` a previous
        // invocation obtained — sealing the image itself would have meant sealing tens of KB of
        // base64 PNG into every `unikey`. Reusing it here, rather than calling `createWechatQr`
        // again, is what keeps this call from minting a second, different WeChat QR under the same
        // `unikey`; only the image is re-fetched.
        if (session.identifier) {
            return {
                identifier: session.identifier,
                imageUrl: await fetchWechatQrImage(options.http(session), session.identifier, { signal }),
            };
        }
        const qr = await createWechatQr(options.http(session), { signal });
        return { identifier: qr.identifier, imageUrl: qr.imageUrl };
    },
    advance: async (session, budgetMs, signal) => {
        if (!session.identifier)
            return [];
        const startedAt = Date.now();
        try {
            const status = await pollWechatQr(options.http(session), session.identifier, {
                budgetMs,
                signal,
            });
            const event = eventForWechatStatus(status);
            logWechatQr(session, 'poll', {
                outcome: 'status',
                upstreamCode: status.upstreamCode,
                durationMs: Math.max(0, Date.now() - startedAt),
                budgetMs,
            });
            return [event];
        }
        catch (error) {
            // The budget elapsing is the normal outcome of a long poll that saw no state change, so it
            // reports "nothing happened" rather than an upstream failure. A caller-driven abort is a
            // real cancellation and stays an error.
            if (isAbortError(error) && signal?.aborted !== true) {
                logWechatQr(session, 'poll', {
                    outcome: 'budget-expired',
                    durationMs: Math.max(0, Date.now() - startedAt),
                    budgetMs,
                });
                return [];
            }
            const failure = qrFailureDetailsOf(error, 'qr-poll', 'wechat');
            logWechatQr(session, 'poll', {
                outcome: 'error',
                durationMs: Math.max(0, Date.now() - startedAt),
                budgetMs,
                failureReason: failure.failureReason,
                upstreamCode: failure.upstreamCode,
                upstreamHttpStatus: failure.upstreamHttpStatus,
            });
            throw error;
        }
    },
    close: () => undefined,
});

/**
 * 上游明确拒绝了我们送出的凭证时抛出的错误，与「上游因为别的原因失败」区分开。
 *
 * 控制器层把它映射成 401，客户端据此清掉已经失效的会话；其余上游失败继续回 500，因为对那些情况
 * 重试才是正确反应，把它们也当成登出会在一次网络抖动后就把用户踢出去。
 *
 * 放在 `util/` 且不引入任何模块是刻意的：控制器错误中间件需要认得这个类型，而如果它反过来 import
 * `services/auth/qrLogin`，就会把整个鉴权栈连同 `ws` 一起拖进日志路径的依赖闭包里。
 */
class AuthCredentialRejectedError extends Error {
    upstreamCode;
    /** 控制器与中间件读这个值决定回应状态码。 */
    httpStatus = 401;
    constructor(upstreamCode) {
        super('Login required');
        this.upstreamCode = upstreamCode;
        this.name = 'AuthCredentialRejectedError';
    }
}

/**
 * 请求本身不被接受（例如查询别人的账号），调用方改参数就能解决，不是服务端故障。
 *
 * 控制器包装与 serverless 兜底都把它映射成 400，回应是 `{ code: 400, message }`，与其他用户路由的
 * 400 同形。message 只用固定文字，不夹带调用方输入。
 *
 * 和 `authError.ts` 一样放在 `util/`、不引入任何模块：日志路径与 serverless 都要认得它。
 */
class RequestRejectedError extends Error {
    httpStatus = 400;
    constructor(message) {
        super(message);
        this.name = 'RequestRejectedError';
    }
}

// 网关与凭证码冲突时供两个宿主返回 502，协议数字和安全说明仍保持原形。
class GatewayCredentialConflictError extends Error {
    responseStatus = 502;
    phase;
    upstreamCode;
    globalCode;
    httpStatus;
    constructor(error) {
        super(`${error.phase} failed (HTTP ${error.httpStatus}, global=${error.globalCode}, code=${error.upstreamCode ?? 'unknown'})`);
        // 安全摘要继续走协议错误的白名单，502 是客户端收到的状态，不覆盖上游 HTTP 200。
        this.name = 'QqProtocolError';
        this.phase = error.phase;
        this.upstreamCode = error.upstreamCode;
        this.globalCode = error.globalCode;
        this.httpStatus = error.httpStatus;
    }
}

// src/services/songLists/officialPlaylist.ts
//
// QQ 音乐官方按账号生成的歌单（每日30首、百万收藏、歌手漫游……）的两条共用规则。
// 只依赖 `auth/values`，保持运行时中立：Node 与 serverless 都从这里取同一套判定与改写。
/**
 * 官方歌单在 `/user/playlist` 的收藏条目里用 `dirType` 标出来（2026-10-09 真实账号实测）：
 * - `3`：算法歌单（百万收藏 `211111`、新歌推荐 `211207`、歌手漫游 `211192`）。匿名的
 *   `fcg_ucc_getcdinfo_byids_cp` 对它们只回 `code: 10`，要带登录凭据走 `uniform_get_Dissinfo`；
 * - `2`：每日30首。匿名 CGI 读得到，但同样是按账号每天生成的。
 * 普通收藏是 `0`，自建歌单的条目没有这个字段。只认这两个值，未知的类型一律当普通歌单。
 */
const OFFICIAL_PLAYLIST_DIR_TYPES = new Set([2, 3]);
const isOfficialPlaylistEntry = (entry) => {
    const raw = dictionaryOf(entry).dirType;
    // `numberOf(null)` 是 0、`numberOf('')` 也是 0，所以先挡掉空值，免得把缺字段读成某个类型
    if (raw === null || raw === undefined || raw === '')
        return false;
    const dirType = numberOf(raw);
    return dirType !== undefined && OFFICIAL_PLAYLIST_DIR_TYPES.has(dirType);
};
const ALBUM_MID_PATTERN = /^[0-9A-Za-z]+$/;
/** 与歌曲封面同一种写法（`T002` 是专辑图），下游已有的尺寸处理可以直接套用。 */
const albumCoverUrlOf = (albumMid) => {
    const mid = stringOf(albumMid).trim();
    return mid && ALBUM_MID_PATTERN.test(mid)
        ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${mid}.jpg?max_age=2592000`
        : undefined;
};
/** 专辑图地址的写法：`T002R{尺寸}M000{专辑 mid}.jpg`，后面可能跟 `?max_age=…`。 */
const ALBUM_COVER_URL_PATTERN = /\/T002R\d+x\d+M000([0-9A-Za-z]+)\.(?:jpg|jpeg|png|webp)(?:\?|$)/;
/** 从专辑图地址里取出专辑 mid；不是专辑图（比如日历图）或认不出来就返回 `undefined`。 */
const albumMidOfCoverUrl = (url) => ALBUM_COVER_URL_PATTERN.exec(stringOf(url).trim())?.[1];
/**
 * 官方歌单的收藏条目自带的 `albumPicUrl`，只要它是一张专辑图，就是第一首歌的专辑图（2026-10-09
 * 真实账号实测）。拿它拼出和 `firstSongAlbumCoverUrl` 完全一样的封面地址，就不用再为每张官方歌单多读
 * 一次上游。
 *
 * 不看 `logo`：每日30首的 `logo` 是日历图，不是专辑图。
 */
const albumPicCoverUrlOf = (entry) => albumCoverUrlOf(albumMidOfCoverUrl(dictionaryOf(entry).albumPicUrl));
/**
 * 官方歌单的封面就是第一首歌的专辑图，与 QQ 音乐客户端的显示一致。第一首没有专辑时不往后找，
 * 返回 `undefined`，由调用方保留原来的封面。
 */
const firstSongAlbumCoverUrl = (songlist) => {
    const first = Array.isArray(songlist) ? songlist[0] : undefined;
    return albumCoverUrlOf(dictionaryOf(dictionaryOf(first).album).mid);
};
const safeIntegerOf$1 = (value) => typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
/** `numberOf(null)` 是 0；歌曲数缺失时要退回下一个来源，不能当成 0 首。 */
const countOf$5 = (value) => value === null || value === undefined || value === '' ? undefined : numberOf(value);
const toSongListDetailResponse = (data) => {
    if (!isDictionary(data))
        return null;
    const dirinfo = dictionaryOf(data.dirinfo);
    const disstid = identifierOf(dirinfo.id);
    const title = stringOf(dirinfo.title).trim();
    const songlist = Array.isArray(data.songlist) ? data.songlist : [];
    if (!disstid || !title || songlist.length === 0)
        return null;
    const total = countOf$5(data.total_song_num) ?? countOf$5(dirinfo.songnum) ?? songlist.length;
    const nickname = stringOf(dirinfo.host_nick);
    return {
        code: 0,
        subcode: 0,
        cdnum: 1,
        realcdnum: 1,
        cdlist: [
            {
                disstid,
                dissname: stringOf(dirinfo.title),
                logo: firstSongAlbumCoverUrl(songlist) ?? stringOf(dirinfo.picurl),
                desc: stringOf(dirinfo.desc),
                nickname,
                nick: nickname,
                dir_show: numberOf(dirinfo.dir_show) ?? 0,
                dirid: numberOf(dirinfo.dirid) ?? 0,
                song_begin: 0,
                cur_song_num: songlist.length,
                songnum: total,
                total_song_num: total,
                // 这次读取的结论：1 表示停在安全上限、空页或重复页，歌单还没读完。匿名 CGI 的回应不带这个字段。
                hasmore: data.hasmore === true || numberOf(data.hasmore) === 1 ? 1 : 0,
                // 播放数与建立者 id 沿用上游字段名。listennum 和匿名 CGI 的 visitnum 是不是同一个统计还没核对过，
                // 所以不写进 visitnum；上游没给或类型不对就不补，缺失不当成 0。
                ...(safeIntegerOf$1(dirinfo.listennum) === undefined
                    ? {}
                    : { listennum: safeIntegerOf$1(dirinfo.listennum) }),
                ...(safeIntegerOf$1(dirinfo.host_uin) === undefined
                    ? {}
                    : { uin: safeIntegerOf$1(dirinfo.host_uin) }),
                ...(stringOf(dirinfo.encrypt_uin) ? { encrypt_uin: stringOf(dirinfo.encrypt_uin) } : {}),
                songlist,
            },
        ],
    };
};

// src/services/auth/credentialWire.ts
// 从认证入口搬出的同一套实现；协议、状态与对外回包沿用原规则。
const MOBILE_LOGIN_TYPE = 6;
const credentialFrom = (value, defaultLoginType) => {
    const musicid = value.musicid ?? value.str_musicid;
    const musickey = stringOf(value.musickey);
    if ((!stringOf(musicid) && typeof musicid !== 'number') || !musickey)
        throw new Error('Login response missing credential');
    return {
        ...value,
        musicid: musicid,
        musickey,
        // The channel that produced the credential is the fallback, never a fixed 6: a WeChat
        // credential sent back with `tmeLoginType: 6` would be rejected on every later request.
        loginType: numberOf(value.loginType) ?? defaultLoginType,
    };
};
const PRIVATE_RESPONSE_KEYS = new Set([
    'musickey',
    'authst',
    'qqmusic_key',
    'token',
    'qimei',
    'qimei36',
    'sid',
    'vkey',
]);
const sanitizePublicValue = (value) => {
    if (Array.isArray(value))
        return value.map(sanitizePublicValue);
    if (!isDictionary(value))
        return value;
    return Object.fromEntries(Object.entries(value)
        .filter(([key]) => !PRIVATE_RESPONSE_KEYS.has(key.toLowerCase()))
        .map(([key, item]) => [key, sanitizePublicValue(item)]));
};
const exchangeCredential = async (http, device, qrcodeId, musicid, token) => credentialFrom(await callMusicu(http, device, 'credential-exchange', 'music.login.LoginServer', 'Login', { musicid: Number(musicid), qrCodeID: qrcodeId, token }, undefined, { tmeLoginType: MOBILE_LOGIN_TYPE }), MOBILE_LOGIN_TYPE);
/**
 * WeChat channel exchange: the OAuth `code` from the web flow, not an MQTT token. It runs on
 * the shared device-bound client because it is a musicu call and needs the Android comm; the
 * WeChat endpoints themselves never see that device context.
 */
const exchangeWechatCredential = async (http, device, code) => credentialFrom(await callMusicu(http, device, 'credential-exchange', 'music.login.LoginServer', 'Login', { code, strAppid: WECHAT_APP_ID }, undefined, { tmeLoginType: WECHAT_LOGIN_TYPE }), WECHAT_LOGIN_TYPE);

// src/services/auth/playlistPlayCounts.ts
//
// `/user/playlist?playCount=1` 的播放数。Android 自建列表的 `play_cnt` 实测全是 0、收藏列表没有这个字段，
// 旧接口才有：自建 `fcg_user_created_diss` 的 `listen_num`、收藏 `fcg_get_profile_order_asset`（reqtype 3）的
// `listennum`。官方网页每页 10 张（自建请求 11、收藏闭区间 sin..sin+10），按歌单 id 对回原列表。
// 只补数字，不替换列表来源；任何一步读不到都不影响列表本身。
const CREATED_URL = 'https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss';
const FAVORITE_URL = 'https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg';
const PAGE_STEP = 10;
/** 每份清单最多读这么多页（100 张）；更多的就标成没补完。 */
const PLAY_COUNT_PAGE_LIMIT = 10;
const idOf = (value) => {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
        return String(value);
    if (typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value))
        return value;
    return undefined;
};
const countOf$4 = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
const SOURCES = {
    created: {
        phase: 'get-created-playlist-play-counts',
        url: CREATED_URL,
        params: (sin, auth) => ({
            hostuin: credentialMusicId(auth.credential),
            sin,
            size: PAGE_STEP + 1,
            format: 'json',
        }),
        read: (data, sin) => {
            if (!Array.isArray(data.disslist))
                return undefined;
            const total = numberOf(data.totoal);
            return {
                entries: data.disslist.map((item) => {
                    const entry = dictionaryOf(item);
                    return { id: idOf(entry.tid), count: countOf$4(entry.listen_num) };
                }),
                done: data.disslist.length === 0 || total === undefined || sin + PAGE_STEP >= total,
            };
        },
    },
    favorite: {
        phase: 'get-favorite-playlist-play-counts',
        url: FAVORITE_URL,
        params: (sin, auth) => ({
            ct: 20,
            cid: 205360956,
            userid: credentialMusicId(auth.credential),
            reqtype: 3,
            sin,
            ein: sin + PAGE_STEP,
            format: 'json',
        }),
        read: (data) => {
            if (!Array.isArray(data.cdlist))
                return undefined;
            return {
                entries: data.cdlist.map((item) => {
                    const entry = dictionaryOf(item);
                    return { id: idOf(entry.dissid), count: countOf$4(entry.listennum) };
                }),
                done: data.cdlist.length === 0 || data.has_more !== 1,
            };
        },
    },
};
/** 读完一份清单的播放数；`complete` 只有每一页都读到、而且确实读到尾时才是 true。 */
const readCounts = async (http, auth, source) => {
    const counts = new Map();
    for (let page = 0; page < PLAY_COUNT_PAGE_LIMIT; page += 1) {
        const sin = page * PAGE_STEP;
        let result;
        try {
            const response = await http.request({
                url: source.url,
                method: 'GET',
                params: source.params(sin, auth),
                headers: { Referer: 'https://y.qq.com/', Cookie: credentialCookieHeader(auth.credential) },
            });
            const body = dictionaryOf(response.data);
            const code = numberOf(body.code);
            logger.info('qq-auth.upstream-result', {
                phase: source.phase,
                httpStatus: response.status,
                globalCode: code,
                upstreamCode: numberOf(body.subcode),
            });
            if (code === 0 && isDictionary(body.data))
                result = source.read(body.data, sin);
        }
        catch {
            result = undefined;
        }
        if (!result)
            return { counts, complete: false };
        for (const { id, count } of result.entries)
            if (id !== undefined && count !== undefined && !counts.has(id))
                counts.set(id, count);
        if (result.done)
            return { counts, complete: true };
    }
    return { counts, complete: false };
};
/**
 * 给自建与收藏条目补 `play_cnt`。对得上、而且是非负整数才给；其余条目拿掉 `play_cnt`，
 * 不把 Android 给的 0 当成真的播放数。只读需要的那份清单。
 */
const withPlayCounts = async (http, auth, created, favorites, idOfPlaylist) => {
    const [createdCounts, favoriteCounts] = await Promise.all([
        created.length ? readCounts(http, auth, SOURCES.created) : undefined,
        favorites.length ? readCounts(http, auth, SOURCES.favorite) : undefined,
    ]);
    const apply = (list, counts) => list.map((value) => {
        if (!isDictionary(value))
            return value;
        const { play_cnt: _ignored, ...rest } = value;
        const count = counts?.get(idOfPlaylist(value));
        return count === undefined ? rest : { ...rest, play_cnt: count };
    });
    return {
        created: apply(created, createdCounts?.counts),
        favorites: apply(favorites, favoriteCounts?.counts),
        complete: (createdCounts?.complete ?? true) && (favoriteCounts?.complete ?? true),
    };
};

// src/services/auth/credentialExpiry.ts
// 凭证寿命的计算。会话保存与静默续期都要用，单独放一个不依赖协议调用的模块，免得互相引用。
/** 上游没有交代 musickey 寿命时的兜底会话时长，也是这个常量原本的唯一用途。 */
const AUTH_TTL_MS = 24 * 60 * 60 * 1000;
/** 推导出来的会话时长夹在这个区间内，挡住上游给出畸形时间时的两个极端。 */
const AUTH_TTL_MIN_MS = 60 * 60 * 1000;
const AUTH_TTL_MAX_MS = 7 * 24 * 60 * 60 * 1000;
/** musickey 自己说的到期时间（毫秒）；缺字段或值不合理时是 `null`。 */
const credentialExpiryAt = (credential) => {
    const createdAtSeconds = numberOf(credential.musickeyCreateTime);
    const lifetimeSeconds = numberOf(credential.keyExpiresIn);
    if (!createdAtSeconds || !lifetimeSeconds || createdAtSeconds <= 0 || lifetimeSeconds <= 0)
        return null;
    return (createdAtSeconds + lifetimeSeconds) * 1000;
};
/**
 * 会话到期时间跟着 musickey 自己的寿命走。
 *
 * 上游的凭证带着 `musickeyCreateTime`（epoch 秒）与 `keyExpiresIn`（秒，实测 259200 = 整三天）。
 * 之前这里硬编 24 小时，比上游短，于是用户每天都得重新扫码——而那并不是 QQ 要求的。缺字段或者值不
 * 合理时退回原来的 24 小时，结果再夹进 `[1 小时, 7 天]`，因此一份畸形的上游回应既不会立刻作废会话，
 * 也不会签发一个远超凭证寿命的会话。
 *
 * 凭证已经过期时算出来的时长是负的，会被夹到 1 小时；那一小时里任何一次上游调用都会被拒绝并映射成
 * 401，客户端照样能干净地登出。
 */
const authSessionExpiryAt = (credential, now) => {
    const credentialExpiresAt = credentialExpiryAt(credential);
    if (credentialExpiresAt === null)
        return now + AUTH_TTL_MS;
    const ttl = credentialExpiresAt - now;
    if (ttl < AUTH_TTL_MIN_MS)
        return now + AUTH_TTL_MIN_MS;
    if (ttl > AUTH_TTL_MAX_MS)
        return now + AUTH_TTL_MAX_MS;
    return now + ttl;
};

const CREDENTIAL_REFRESH_SAFETY_CODES = new Set([1000, 104401, 104400]);
/** 上游用这几个安全码明确表示「这份凭证我不认」，与超时、限流、协议变动等失败区分开。 */
const isCredentialRejection = (error) => error instanceof QqProtocolError &&
    // 收藏专辑的 CGI 只有一个 code，旧错误对象把它放进两个字段，不是两层网关冲突。
    (error.globalCode === 0 || error.phase === 'get-user-favorite-albums') &&
    error.upstreamCode !== undefined &&
    CREDENTIAL_REFRESH_SAFETY_CODES.has(error.upstreamCode);
/**
 * 在服务边界把「上游拒绝凭证」翻译成控制器层会回 401 的那一个错误。
 *
 * 只映射这三个已知安全码；其余上游失败保持原样，因此一次上游抖动不会把用户登出。上游的码是不透明
 * 数字，将来发现漏掉的码时在 `CREDENTIAL_REFRESH_SAFETY_CODES` 里补，映射逻辑不必改。
 */
const withCredentialRejectionMapped = async (operation) => {
    try {
        return await operation();
    }
    catch (error) {
        if (error instanceof QqProtocolError &&
            error.phase !== 'get-user-favorite-albums' &&
            error.globalCode !== 0 &&
            error.httpStatus >= 200 &&
            error.httpStatus < 300 &&
            error.upstreamCode !== undefined &&
            CREDENTIAL_REFRESH_SAFETY_CODES.has(error.upstreamCode))
            throw new GatewayCredentialConflictError(error);
        if (isCredentialRejection(error))
            throw new AuthCredentialRejectedError(error.upstreamCode);
        throw error;
    }
};
const getLoginUserWithCredential = async (http, device, credential) => dictionaryOf(sanitizePublicValue(await callMusicu(http, device, 'get-login-user', 'music.UserInfo.userInfoServer', 'GetLoginUserInfo', {}, credential)));
const getLoginUser = async (http, auth) => getLoginUserWithCredential(http, auth.device, auth.credential);
/**
 * Builds the same public profile shape from the non-secret identity fields in a credential.
 *
 * The account id is the one `credentialMusicId` resolves, never the raw `musicid`: a WeChat
 * credential carries a placeholder there and keeps the real id in `str_musicid`, which is why
 * every upstream call this service makes already goes through that helper. Handing out the raw
 * field would publish an id the service itself refuses to key its own requests on.
 */
const publicProfileFromCredential = (credential) => {
    const musicId = credentialMusicId(credential);
    const nickname = stringOf(credential.nick) || stringOf(credential.nickname);
    const avatarUrl = stringOf(credential.logo) || stringOf(credential.avatarUrl);
    return {
        ...(musicId ? { musicid: musicId, str_musicid: musicId } : {}),
        ...(nickname ? { nickname, nick: nickname } : {}),
        ...(avatarUrl ? { avatarUrl } : {}),
    };
};
/**
 * `GetLoginUserInfo` never carries an account id. Measured against a real session, its top-level
 * keys are `errMsg` / `identify` / `info` / `celebrityInfo` plus operational slots, and every
 * account field lives under the nested `info` — there is no `musicid` or `uin` anywhere in it.
 * The credential-derived profile is therefore layered underneath as a default instead of only
 * standing in when the call fails. The two key sets are disjoint, so a successful reply still
 * wins on every field it does answer with.
 *
 * 这里曾经还有一条 WeChat 专用的兜底：上游用安全码拒绝凭证时改回传凭证里的字段。那让 `/login/status`
 * 报告「已登录」，而同一份凭证在其余 `/user/*` 上全部失败，用户卡在一个自己清不掉的状态里。拒绝现在
 * 直接往外抛，由服务边界映射成 401。
 */
const getLoginProfile = async (http, auth) => ({
    ...publicProfileFromCredential(auth.credential),
    ...(await getLoginUser(http, auth)),
});
const refreshCredentialAs = async (http, device, credential, loginType) => credentialFrom(await callMusicu(http, device, 'credential-refresh', 'music.login.LoginServer', 'Login', {
    openid: stringOf(credential.openid),
    refresh_token: stringOf(credential.refresh_token),
    str_musicid: stringOf(credential.str_musicid) || String(credential.musicid),
    musickey: credential.musickey,
    unionid: stringOf(credential.unionid),
    refresh_key: stringOf(credential.refresh_key),
    loginMode: 2,
}, credential, { tmeLoginType: loginType }), loginType);
/** Refreshes a WeChat credential with the complete field set returned by its QR exchange. */
const refreshWechatCredential = (http, device, credential) => refreshCredentialAs(http, device, credential, WECHAT_LOGIN_TYPE);
/**
 * The stored silent refresh, for either channel: the login type is the one the credential already
 * carries, which is also what every authenticated read sends as `tmeLoginType`.
 */
const refreshLoginCredential = (http, device, credential) => refreshCredentialAs(http, device, credential, credential.loginType);
/** Refreshes the exchanged WeChat key once when the reference credential check requests it. */
const validateWechatCredential = async (http, device, credential) => {
    try {
        await getLoginUserWithCredential(http, device, credential);
        return credential;
    }
    catch (error) {
        if (!(error instanceof QqProtocolError) ||
            error.upstreamCode === undefined ||
            !CREDENTIAL_REFRESH_SAFETY_CODES.has(error.upstreamCode))
            throw error;
    }
    const refreshed = await refreshWechatCredential(http, device, credential);
    logger.info('qq-auth.credential-refreshed', {
        loginChannel: 'wechat',
        credentialLoginType: refreshed.loginType,
        credentialKeys: Object.keys(refreshed).sort(),
        credentialKeyLength: refreshed.musickey.length,
    });
    return refreshed;
};
/** 收藏歌单最多读这么多条：上游一直说还有更多时，不能无限读下去。 */
const FAVORITE_PLAYLIST_LIMIT = 1000;
const FAVORITE_PLAYLIST_PAGE_SIZE = 100;
const hasMoreOf = (page) => page.hasmore === true || numberOf(page.hasmore) === 1;
/**
 * 没读完就停下时留一条诊断。停下是为了不无限读，不代表资料完整；这条日志说明为什么停、读到多少，
 * 只有数量，不记账号或歌单 id。
 */
const logPagingStopped = (source, reason, pages, items, upstreamTotal) => {
    logger.warn('qq-auth.paging-stopped', {
        source,
        reason,
        pages,
        items,
        ...(upstreamTotal !== undefined && Number.isSafeInteger(upstreamTotal)
            ? { upstreamTotal }
            : {}),
    });
};
/** 登录账号自己的 id：解析后的账号 id，或凭证里原样的两个字段（微信凭证的 `musicid` 是占位的 0）。 */
const isOwnAccountId = (credential, uid) => [
    credentialMusicId(credential),
    identifierOf(credential.musicid),
    identifierOf(credential.str_musicid),
].includes(uid.trim());
const playlistIdOf = (value) => {
    const item = dictionaryOf(value);
    return identifierOf(item.tid ?? item.dissid ?? item.id ?? item.dirId ?? item.dirid);
};
/**
 * 第一轮（`favoriteOffset` 为 0）回自建＋收藏；从 `favoriteOffset` 接着读的那几轮只回收藏。
 * 每一轮最多读 1000 条收藏。读到上限时给 `nextFavoriteOffset`；空页或重复页停下时不给，
 * 因为接着读也只会重复同一件事。`total` 是真实总数：一轮就读完时是实际条目数；否则是自建数加上
 * 已知的收藏总数（上游报的总数与已经读到的数量取大者）。
 */
const getPlaylists = async (http, auth, favoriteOffset = 0, playCount = false) => {
    const created = await callMusicu(http, auth.device, 'get-user-playlists', 'music.musicasset.PlaylistBaseRead', 'GetPlaylistByUin', { uin: credentialMusicId(auth.credential) }, auth.credential);
    let createdPlaylists = Array.isArray(created.v_playlist) ? created.v_playlist : [];
    let favoritePlaylists = [];
    const encryptedUin = stringOf(auth.credential.encryptUin);
    // 只有上游最后一页说“没有更多了”才算读完。读到上限、遇到空页、或整页都是读过的条目（上游不理
    // offset）时会提前停下，这时回 `bFinish: false`，控制器据此回 `more: true`，不把截断的列表说成完整的。
    let favoritesComplete = true;
    let favoritesKnown = 0;
    let nextFavoriteOffset;
    if (encryptedUin) {
        const seenFavorites = new Set();
        let offset = favoriteOffset;
        let pages = 0;
        let unique = 0;
        let upstreamTotal;
        let stopReason;
        while (offset < favoriteOffset + FAVORITE_PLAYLIST_LIMIT) {
            const favoritePage = await callMusicu(http, auth.device, 'get-user-favorite-playlists', 'music.musicasset.PlaylistFavRead', 'CgiGetPlaylistFavInfo', { uin: encryptedUin, offset, size: FAVORITE_PLAYLIST_PAGE_SIZE }, auth.credential);
            const pageItems = Array.isArray(favoritePage.v_list) ? favoritePage.v_list : [];
            pages += 1;
            upstreamTotal =
                favoritePage.total === undefined ? upstreamTotal : numberOf(favoritePage.total);
            favoritesComplete = !hasMoreOf(favoritePage);
            let fresh = 0;
            for (const item of pageItems) {
                const id = playlistIdOf(item);
                if (id && seenFavorites.has(id))
                    continue;
                if (id)
                    seenFavorites.add(id);
                fresh += 1;
            }
            unique += fresh;
            favoritePlaylists.push(...pageItems.map(withOriginalCover));
            offset += pageItems.length;
            if (favoritesComplete)
                break;
            if (fresh === 0) {
                stopReason = pageItems.length === 0 ? 'empty-page' : 'repeated-page';
                break;
            }
        }
        if (!favoritesComplete) {
            logPagingStopped('favorite-playlists', stopReason ?? 'limit', pages, unique, upstreamTotal);
            if (stopReason === undefined)
                nextFavoriteOffset = offset;
        }
        const reported = upstreamTotal !== undefined && Number.isSafeInteger(upstreamTotal) ? upstreamTotal : 0;
        favoritesKnown = Math.max(reported, favoriteOffset + unique);
    }
    const firstRound = favoriteOffset === 0;
    // 只有调用方明确要播放数才多读旧接口；不带参数时请求与回包都和以前一样。
    let playCountComplete;
    if (playCount) {
        const counted = await withPlayCounts(http, auth, firstRound ? createdPlaylists : [], favoritePlaylists, playlistIdOf);
        if (firstRound)
            createdPlaylists = counted.created;
        favoritePlaylists = counted.favorites;
        playCountComplete = counted.complete;
    }
    const seen = new Set();
    const listed = firstRound ? [...createdPlaylists, ...favoritePlaylists] : favoritePlaylists;
    const playlists = listed.filter((value) => {
        const id = playlistIdOf(value);
        if (!id)
            return true;
        if (seen.has(id))
            return false;
        seen.add(id);
        return true;
    });
    return dictionaryOf(sanitizePublicValue({
        ...created,
        v_playlist: await withOfficialPlaylistCovers(http, auth, playlists),
        total: firstRound && favoritesComplete
            ? playlists.length
            : createdPlaylists.length + favoritesKnown,
        bFinish: favoritesComplete,
        ...(nextFavoriteOffset === undefined ? {} : { nextFavoriteOffset }),
        ...(playCountComplete === undefined ? {} : { playCountComplete }),
    }));
};
/** 下游读封面的字段，与 `GetPlaylistByUin` 给自建歌单的同名。 */
const PLAYLIST_COVER_FIELDS = ['bigpicUrl', 'picUrl', 'picurl', 'coverUrl'];
/**
 * 收藏的他人歌单沿用歌单原本的封面：收藏者改不了封面，歌单主人设成什么（自定义图、第一首歌的
 * 专辑……）就显示什么。`CgiGetPlaylistFavInfo` 只给 `logo`（没有时看 `albumPicUrl`），下游读的是
 * `bigpicUrl` / `picUrl`，所以照自建歌单条目的字段名补上；两个都没有就原样，不编一个封面出来。
 *
 * 官方歌单另有规则（第一首歌的专辑图，见 `withOfficialPlaylistCovers`），这里跳过；已经带着
 * 封面字段的条目也原样。不发任何请求。
 */
const withOriginalCover = (value) => {
    if (!isDictionary(value) || isOfficialPlaylistEntry(value))
        return value;
    if (PLAYLIST_COVER_FIELDS.some((field) => stringOf(value[field]).trim()))
        return value;
    const cover = stringOf(value.logo).trim() || stringOf(value.albumPicUrl).trim();
    return cover ? { ...value, bigpicUrl: cover, picUrl: cover } : value;
};
/** 一次 `/user/playlist` 最多为这么多张官方歌单读第一首歌补封面；每张多一次上游请求。 */
const OFFICIAL_PLAYLIST_COVER_LIMIT = 20;
/**
 * 官方歌单（每日30首、算法歌单）的封面一律是第一首歌的专辑图，与 QQ 音乐客户端的显示一致。
 * 写进下游最先读的 `bigpicUrl` 与 `picUrl`（与自建歌单条目同名），`logo` / `albumPicUrl` 保留上游原值。
 *
 * 条目自带的 `albumPicUrl` 是专辑图时直接用它，不发请求；缺失或认不出来才为这一张多读一首歌，
 * 这类请求彼此并行、一次最多 20 张。读不到时条目原样返回：补封面失败不能让整个歌单列表跟着失败。
 */
const withOfficialPlaylistCovers = async (http, auth, playlists) => {
    let remaining = OFFICIAL_PLAYLIST_COVER_LIMIT;
    return Promise.all(playlists.map(async (value) => {
        if (!isOfficialPlaylistEntry(value))
            return value;
        const known = albumPicCoverUrlOf(value);
        if (known)
            return { ...dictionaryOf(value), bigpicUrl: known, picUrl: known };
        const disstid = positiveIdOf$2(dictionaryOf(value).tid);
        // 额度在第一个 await 之前扣，所以按列表顺序分配，与请求完成的先后无关
        if (!disstid || remaining <= 0)
            return value;
        remaining -= 1;
        try {
            const data = await withCredentialRejectionMapped(() => getAuthenticatedSongListDetail(http, auth, disstid, 1));
            const cover = firstSongAlbumCoverUrl(data.songlist);
            return cover ? { ...dictionaryOf(value), bigpicUrl: cover, picUrl: cover } : value;
        }
        catch (error) {
            logger.warn('qq-auth.official-playlist-cover-failed', {
                name: error instanceof Error ? error.name : 'Error',
                upstreamCode: error instanceof QqProtocolError || error instanceof AuthCredentialRejectedError
                    ? error.upstreamCode
                    : undefined,
            });
            return value;
        }
    }));
};
/** 只接受正整数 id；`0`、负数、小数和带杂字的字符串一律不认，免得把它们送上游。 */
const positiveIdOf$2 = (value) => {
    const text = identifierOf(value).trim();
    if (!/^\d+$/.test(text))
        return undefined;
    const id = Number(text);
    return Number.isSafeInteger(id) && id > 0 ? id : undefined;
};
/** 实测一页 1000 首可以一次读完 761 首的歌单；再多就续页。 */
const AUTHENTICATED_SONG_LIST_PAGE_SIZE = 1000;
const AUTHENTICATED_SONG_LIST_MAX_PAGES = 10;
const songsOf = (data) => Array.isArray(data.songlist) ? data.songlist : [];
const songIdOf = (value) => {
    const song = dictionaryOf(value);
    return identifierOf(song.mid ?? song.songmid ?? song.id ?? song.songid);
};
/**
 * 带凭据读一张歌单。与 `getOwnedPlaylistSongs` 的 `CgiGetDiss` 不同，这里走 QQ 音乐客户端读算法歌单
 * 用的 `music.srfDissInfo.aiDissInfo/uniform_get_Dissinfo`：百万收藏这类按账号生成的歌单，匿名 CGI
 * 只回 `code: 10`，未登录调用这里回 `80120`，带上凭据才读得到（2026-10-09 实测）。
 *
 * 不给 `limit` 时按 `hasmore` 续读，但上游的 `hasmore` 不可全信：空页、读满 `total_song_num`、
 * 或读到第 10 页都会停。给了 `limit` 只读一页 —— 补封面只要第一首；算法歌单本来就无视 `song_num`，
 * 每次都回整张 50 首。
 */
const getAuthenticatedSongListDetail = async (http, auth, disstid, limit) => {
    const readPage = async (songBegin, songNum) => dictionaryOf(sanitizePublicValue(await callMusicu(http, auth.device, 'get-song-list-detail', 'music.srfDissInfo.aiDissInfo', 'uniform_get_Dissinfo', {
        disstid,
        userinfo: 1,
        tag: 1,
        orderlist: 1,
        song_begin: songBegin,
        song_num: songNum,
        onlysonglist: 0,
        enc_host_uin: '',
    }, auth.credential)));
    if (limit !== undefined && Number.isFinite(limit)) {
        return readPage(0, Math.min(AUTHENTICATED_SONG_LIST_PAGE_SIZE, Math.max(1, Math.floor(limit))));
    }
    const first = await readPage(0, AUTHENTICATED_SONG_LIST_PAGE_SIZE);
    const songs = [...songsOf(first)];
    const seen = new Set(songs.map(songIdOf).filter(Boolean));
    const total = numberOf(first.total_song_num);
    const readAll = () => total !== undefined && songs.length >= total;
    let last = first;
    let pages = 1;
    let repeatedPage = false;
    for (let page = 1; page < AUTHENTICATED_SONG_LIST_MAX_PAGES; page += 1) {
        if (!hasMoreOf(last) || songsOf(last).length === 0 || readAll())
            break;
        last = await readPage(songs.length, AUTHENTICATED_SONG_LIST_PAGE_SIZE);
        pages += 1;
        const pageSongs = songsOf(last);
        // 上游不理 song_begin、整页都是读过的歌：不接上去，也不再往下读。
        // 认不出身份的歌一律当成新的，不拿来判断重复。
        const repeated = pageSongs.every((song) => {
            const id = songIdOf(song);
            return id !== '' && seen.has(id);
        });
        if (pageSongs.length > 0 && repeated) {
            repeatedPage = true;
            break;
        }
        for (const song of pageSongs) {
            const id = songIdOf(song);
            if (id)
                seen.add(id);
        }
        songs.push(...pageSongs);
    }
    // 回传的 hasmore 说的是这次读取的结果：读满总数或上游说没有更多才算读完；停在上限、空页或重复页
    // 时如实标成没读完，而不是照搬最后一页的原值。
    const complete = readAll() || !hasMoreOf(last);
    if (!complete) {
        const reason = repeatedPage
            ? 'repeated-page'
            : songsOf(last).length === 0
                ? 'empty-page'
                : 'limit';
        logPagingStopped('song-list-detail', reason, pages, songs.length, total);
    }
    return { ...first, songlist: songs, hasmore: complete ? 0 : 1 };
};
const FAVORITE_ASSET_URL = 'https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg';
/** `2` selects favourite albums on this CGI; `3` selects favourite playlists. */
const FAVORITE_ALBUM_REQUEST_TYPE = 2;
/**
 * Favourite albums are the one user collection the musicu RPC face does not answer with.
 * Measured 2026-08-08 against a live session that had two favourited albums:
 * `music.musicasset.AlbumFavRead/CgiGetAlbumFavInfo` does exist, but always replies `80000`
 * with a zero-filled struct — under 13 param shapes (`{}` included) and 4 client identities.
 * The code therefore never meant "no rows", and no sibling method answers either
 * (`CgiGetAlbumFavList` is `40000`, `music.musicasset.SingerFavRead` is `500003`).
 *
 * This legacy profile-asset CGI does answer, and it takes the native QR credential as-is: the
 * same call with `reqtype=3` returns exactly the favourite playlists musicu reports, and falls
 * to `4000` when the cookie is withheld — so it is reading the login state, not public data.
 *
 * `sin`/`ein` bound an inclusive range, not an offset and a count.
 */
const getFavoriteAlbums = async (http, auth, offset = 0, limit = 20) => {
    const safeOffset = Math.max(0, Math.floor(offset));
    const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
    const response = await http.request({
        url: FAVORITE_ASSET_URL,
        method: 'GET',
        params: {
            ct: 20,
            cid: 205360956,
            userid: credentialMusicId(auth.credential),
            reqtype: FAVORITE_ALBUM_REQUEST_TYPE,
            sin: safeOffset,
            ein: safeOffset + safeLimit - 1,
            format: 'json',
        },
        headers: {
            Referer: 'https://y.qq.com/',
            Cookie: credentialCookieHeader(auth.credential),
        },
    });
    const body = dictionaryOf(response.data);
    const code = numberOf(body.code) ?? 0;
    logger.info('qq-auth.upstream-result', {
        phase: 'get-user-favorite-albums',
        httpStatus: response.status,
        globalCode: code,
        upstreamCode: numberOf(body.subcode),
    });
    if (code !== 0)
        throw new QqProtocolError('get-user-favorite-albums', code, code, response.status);
    return dictionaryOf(sanitizePublicValue(dictionaryOf(body.data)));
};
const LIKED_SONGS_DIRID = 201;
/**
 * Reads one playlist the logged-in user owns. Unlike the anonymous `fcg_ucc_getcdinfo_byids_cp`
 * behind `/getSongListDetail`, this call carries the credential, so a playlist the owner set to
 * 不公开 (`dirShow: 2`) still comes back with its songs instead of an empty `code: 0` shell.
 */
const getOwnedPlaylistSongs$1 = async (http, auth, { disstid = 0, dirid = 0, offset = 0, limit = 100 } = {}, phase = 'get-owned-playlist-songs') => {
    const encryptedUin = stringOf(auth.credential.encryptUin);
    if (!encryptedUin)
        throw new Error('Login credential is missing encryptUin');
    const safeOffset = Math.max(0, Math.floor(offset));
    const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
    return dictionaryOf(sanitizePublicValue(await callMusicu(http, auth.device, phase, 'music.srfDissInfo.DissInfo', 'CgiGetDiss', {
        disstid: Number(disstid) || 0,
        dirid: Number(dirid) || 0,
        tag: true,
        song_begin: safeOffset,
        song_num: safeLimit,
        userinfo: true,
        orderlist: true,
        enc_host_uin: encryptedUin,
    }, auth.credential)));
};
/** 「我喜欢」is `dirid: 201` of the same call; the phase name stays so existing log queries hold. */
const getLikedSongs = (http, auth, offset = 0, limit = 100) => getOwnedPlaylistSongs$1(http, auth, { disstid: 0, dirid: LIKED_SONGS_DIRID, offset, limit }, 'get-user-liked-songs');

const createMemoryDeviceContextRepository = (seed = null) => {
    let stored = seed ? { ...seed } : null;
    return {
        kind: 'memory',
        load: () => (stored ? { ...stored } : null),
        save: (device) => {
            stored = { ...device };
        },
        clear: () => {
            stored = null;
        },
    };
};
/**
 * Loads the persisted context lazily on first use, so importing the auth service never
 * touches the filesystem, and writes back after each protocol step that mutates it.
 */
const createDeviceContextStore = (repository) => {
    let device = null;
    const load = () => {
        if (device)
            return device;
        const restored = repository.load();
        device = restored ?? createAndroidDevice();
        logger.info('qq-auth.device-context.ready', {
            kind: repository.kind,
            source: restored ? 'restored' : 'created',
            ...describeDeviceContext(device),
        });
        if (!restored)
            repository.save(device);
        return device;
    };
    return {
        get: load,
        persist: () => {
            if (device)
                repository.save(device);
        },
        reset: () => {
            device = createAndroidDevice();
            repository.save(device);
            logger.info('qq-auth.device-context.ready', {
                kind: repository.kind,
                source: 'reset',
                ...describeDeviceContext(device),
            });
            return device;
        },
    };
};

// src/protocol/playbackDiagnostics.ts
//
// 取不到播放链接时，只从单曲条目（取链接响应里的 `midurlinfo[i]`）挑登记过的数字字段留作证据。
// 这些数字的含义还没有实测，这里只收集、不解释；对外回应不受影响。零依赖，两个运行时共用。
/** 单曲条目里可能带失败原因的数字字段。不在这里的字段一律不收。 */
const PLAYBACK_ENTRY_CODE_FIELDS = ['result', 'errtype', 'code', 'subcode'];
/** 安全整数照收；纯数字字符串（上游有时把码写成字符串）换成整数；其他一律丢掉。 */
const safeIntegerOf = (value) => {
    if (typeof value === 'number')
        return Number.isSafeInteger(value) ? value : undefined;
    if (typeof value !== 'string' || !/^-?\d{1,15}$/.test(value))
        return undefined;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
};
const read$2 = (item, key) => {
    try {
        return item && typeof item === 'object' ? item[key] : undefined;
    }
    catch {
        return undefined;
    }
};
const playbackEntryCodesOf = (item) => {
    const codes = {};
    for (const field of PLAYBACK_ENTRY_CODE_FIELDS) {
        const value = safeIntegerOf(read$2(item, field));
        if (value !== undefined)
            codes[field] = value;
    }
    return codes;
};
/**
 * `playback.url-unavailable` 开发日志（debug）的内容：阶段、在请求里的位置、音质和单曲条目的安全错码。
 * 不带歌曲 id、链接、文件名、提示文字或凭证；要知道是哪一首，用 `index` 对回请求。
 */
const playbackUnavailableLogOf = (where) => ({
    phase: where.phase,
    index: where.index,
    quality: where.quality,
    entryCodes: playbackEntryCodesOf(where.entry),
});

// src/protocol/playbackHints.ts
//
// 某首歌拿不到播放链接时，给使用者看的原因（`restriction.hint`）。只是提示：不改 `restriction.key`、
// 不改证据等级。原因不能猜：会员、付费音乐包、地区、下架只有受控对照验证过的规则才能说（在
// `PLAYBACK_HINT_RULES` 里加），其他一律是「原因尚未确认」；要试听却没有可用的试听文件时是「试听不可用」，带会话确认没有试听文件时是「没有试听」。文案是英文预设，前端可以按 key 换成自己的。
// 零依赖，两个运行时共用。
const PLAYBACK_HINT_MESSAGES = {
    'playback.quality-file-unavailable': 'No audio file is available for this quality.',
    'playback.quality-detail-unavailable': 'This quality could not be checked. Please try again later.',
    'playback.reason-unconfirmed': "This song can't be played right now. The exact reason isn't confirmed yet.",
    'playback.preview-unavailable': "A preview isn't available for this song, or the reason isn't confirmed yet.",
    'playback.preview-missing': 'This song has no preview.',
    'playback.maybe-region-restricted': 'This song may not be available in your region.',
    'playback.maybe-music-pack': 'This song may need a paid music pack to play.',
    'playback.maybe-membership': 'This song may need a VIP membership to play in full.',
    'playback.maybe-taken-down': "This song can't be played right now. It may have been taken down.",
};
/**
 * 单一手机 QQ 免费账号、同会话出口及权益受控重复实验的候选。微信同特征可复用提示，但尚未实测。
 * 只认完整数值组合，不扩展位元含义；不是结构化授权分类。其他特征保持未知。
 */
const read$1 = (value, key) => value && typeof value === 'object' ? value[key] : undefined;
const integer = (value) => {
    const parsed = typeof value === 'string' && /^\d{1,15}$/.test(value) ? Number(value) : value;
    return typeof parsed === 'number' && Number.isSafeInteger(parsed) ? parsed : undefined;
};
const tupleOf = (track) => {
    const action = read$1(track, 'action');
    return [
        read$1(action, 'switch'),
        read$1(action, 'msgid'),
        read$1(action, 'alert'),
        read$1(read$1(track, 'pay'), 'pay_play'),
    ]
        .map(integer)
        .join('/');
};
const canLookupPlaybackHint = (context) => context.authenticated &&
    ['m4a', '128'].includes(context.quality) &&
    context.codes.result === 104003 &&
    context.codes.subcode === 1;
const PLAYBACK_HINT_RULES = [
    {
        key: 'playback.maybe-region-restricted',
        matches: (track, context) => Boolean(context &&
            canLookupPlaybackHint(context) &&
            ['1/23/0/0', '769/0/35/0', '769/0/35/1'].includes(tupleOf(track))),
    },
    {
        key: 'playback.maybe-membership',
        matches: (track, context) => Boolean(context &&
            canLookupPlaybackHint(context) &&
            [`${0x101d701}/13/21/1`, `${0x101d701}/13/41/1`, `${0x1019701}/13/41/1`].includes(tupleOf(track))),
    },
];
const hint = (key) => ({
    key,
    message: PLAYBACK_HINT_MESSAGES[key],
});
const matches = (rule, trackInfo, context) => {
    try {
        return rule.matches(trackInfo, context);
    }
    catch {
        return false;
    }
};
const playbackHintOf = (trackInfo, rules = PLAYBACK_HINT_RULES, context) => {
    const rule = rules.find((candidate) => matches(candidate, trackInfo, context));
    return hint(rule?.key ?? 'playback.reason-unconfirmed');
};
/** 要试听却没有可用的试听文件（或要了也没给链接）时的那一句。 */
const previewUnavailableHint = () => hint('playback.preview-unavailable');
/** 同一会话读到的详情可靠、`size_try` 正好是 0：确定这首没有试听文件。 */
const previewMissingHint = () => hint('playback.preview-missing');

// src/protocol/playbackRestriction.ts
//
// `/getMusicPlay` 某首歌拿不到链接时附在 `playUrl[mid].restriction` 上的结构化原因。
//
// 规则很简单：没有受控实验证据，就只说「拿不到链接，原因未确认」（`url_unavailable`），
// 不猜会员、购买、地区或下架。分类框架先建好，规则表等有证据再填。零依赖，两个运行时共用。
const PLAYBACK_QUALITIES = ['m4a', '128', '320', 'ape', 'flac'];
const playbackQualityOf = (value) => {
    const text = String(value ?? '');
    return PLAYBACK_QUALITIES.includes(text)
        ? text
        : '128';
};
/** 正式路径用的规则表。拿到受控实验的证据之前保持为空：所有失败都是 `url_unavailable`。 */
const PLAYBACK_RESTRICTION_RULES = [];
const ruleMatches = (rule, input) => {
    try {
        return rule.matches(input) === true;
    }
    catch {
        return false;
    }
};
const withCodes = (codes) => Object.keys(codes).length ? { codes: { ...codes } } : {};
const classifyPlaybackRestriction = (input, rules = PLAYBACK_RESTRICTION_RULES) => {
    for (const rule of rules) {
        if (rule.evidence !== 'verified-controlled')
            continue;
        if (ruleMatches(rule, input))
            return { key: rule.key, evidence: rule.evidence, ...withCodes(input.codes) };
    }
    // 「拿不到链接」本身是在响应里看到的事实；原因未确认。
    return { key: 'url_unavailable', evidence: 'observed-response', ...withCodes(input.codes) };
};
// `playback.url-unavailable` 开发日志的内容由 `playbackDiagnostics.ts` 的 `playbackUnavailableLogOf` 产生，
// 这里不再另写一份。

// src/protocol/previewFile.ts
//
// 试听文件（`RS02{media id}.mp3`）要不要去要。2026-10 真账号实测：`size_try` 是 0 的歌上游照样给 RS02 链接，
// CDN 却 404；size_try 大于 0 代表有试听文件，不代表文件大小。文件名用 songmid 代替 media_mid 也会 404。
// 所以只有单曲详情里确认 `size_try > 0`、又有可信的
// media id 才去要；其他一律不要，也不拿 songmid 猜。只依赖 protocol 里的纯模块，两个运行时共用。
const MEDIA_ID_PATTERN = /^[A-Za-z0-9]{14}$/;
const read = (value, key) => {
    try {
        return value && typeof value === 'object' ? value[key] : undefined;
    }
    catch {
        return undefined;
    }
};
/** 只认 14 个字母或数字（前后空白去掉）；其他都当没给。 */
const validMediaIdOf = (value) => {
    const text = typeof value === 'string' ? value.trim() : '';
    return MEDIA_ID_PATTERN.test(text) ? text : undefined;
};
/** 安全整数照收，纯数字字符串换成整数，其他都当没有。 */
const integerOf = (value) => {
    const parsed = typeof value === 'string' && /^\d{1,15}$/.test(value) ? Number(value) : value;
    return typeof parsed === 'number' && Number.isSafeInteger(parsed) ? parsed : undefined;
};
/**
 * `trackInfo` 是单曲详情（`track_info`），读不到时是 `undefined`；`callerMediaId` 是前端给的、已经验过的 media id。
 * 能要试听文件就回文件名要用的 media id（前端给的优先，否则详情里的 `file.media_mid`），不能就回 `undefined`。
 */
const previewMediaIdOf = (trackInfo, callerMediaId) => {
    const file = read(trackInfo, 'file');
    const sizeTry = integerOf(read(file, 'size_try'));
    if (sizeTry === undefined || sizeTry <= 0)
        return undefined;
    return callerMediaId ?? validMediaIdOf(read(file, 'media_mid'));
};
/** 详情里 `size_try` 正好是 0（整数或纯数字字符串）才算确定没有试听文件；缺字段、负数、读不到都不算。 */
const previewFileMissingOf = (trackInfo) => integerOf(read(read(trackInfo, 'file'), 'size_try')) === 0;
/** 不要试听文件的那首歌：和拿不到链接一样是 `url_unavailable`，提示是「试听不可用」。 */
const previewUnavailableRestriction = (authenticated, missing = false) => ({
    ...classifyPlaybackRestriction({
        quality: playbackQualityOf('preview'),
        authenticated,
        codes: {},
    }),
    hint: missing ? previewMissingHint() : previewUnavailableHint(),
});

/** 只守门 ape。缺少可靠数字与确认没文件分开；不从错误码猜文件是否存在。 */
const apeFileFailureOf = (track) => {
    const file = track && typeof track === 'object' ? track.file : undefined;
    const raw = file && typeof file === 'object' ? file.size_ape : undefined;
    const size = typeof raw === 'string' && /^\d{1,15}$/.test(raw) ? Number(raw) : raw;
    if (typeof size !== 'number' || !Number.isSafeInteger(size))
        return 'quality-detail-unavailable';
    return size > 0 ? undefined : 'quality-file-unavailable';
};
const qualityFileRestriction = (authenticated, failureReason) => {
    const key = failureReason === 'quality-file-unavailable'
        ? 'playback.quality-file-unavailable'
        : 'playback.quality-detail-unavailable';
    return {
        ...classifyPlaybackRestriction({ authenticated, quality: 'ape', codes: {} }),
        failureReason,
        hint: { key, message: PLAYBACK_HINT_MESSAGES[key] },
    };
};
/** quality=best 依次尝试的音质，和 Folia 的回退顺序一致。 */
const BEST_QUALITY_ORDER = ['flac', '320', '128'];
const sizeOf = (file, key) => {
    const raw = file && typeof file === 'object' ? file[key] : undefined;
    const size = typeof raw === 'string' && /^\d{1,15}$/.test(raw) ? Number(raw) : raw;
    return typeof size === 'number' && Number.isSafeInteger(size) ? size : undefined;
};
/**
 * quality=best 这首歌要试哪些音质：详情里 size_flac、size_320mp3 大于 0 才试那一级，128 一定是最后一级。
 * 详情读不到（undefined）或数字不可靠时只试 128，不猜文件。
 */
const bestQualityLevelsOf = (track) => {
    const file = track && typeof track === 'object' ? track.file : undefined;
    return [
        ...((sizeOf(file, 'size_flac') ?? 0) > 0 ? ['flac'] : []),
        ...((sizeOf(file, 'size_320mp3') ?? 0) > 0 ? ['320'] : []),
        '128',
    ];
};

// src/services/auth/playback.ts
// 从认证入口搬出的同一套实现；协议、状态与对外回包沿用原规则。
/**
 * `music.vkey.GetVkey/UrlGetVkey` answers with `midurlinfo` but an empty `sip`, unlike the legacy
 * web `CgiGetVkey`. Without a fallback the play URL degrades into a bare filename, which the
 * browser then resolves against its own origin. The stream fallback remains the last resort after
 * probing the known responsive route first, then asking QQ's CDN dispatcher for alternatives.
 */
const DEFAULT_STREAM_DOMAIN = 'http://dl.stream.qqmusic.qq.com/';
const PREFERRED_STREAM_DOMAIN = 'http://sjy6.stream.qqmusic.qq.com/';
const PREFERRED_STREAM_HOST = new URL(PREFERRED_STREAM_DOMAIN).hostname;
const DEFAULT_CDN_REFRESH_MS = 30 * 60 * 1_000;
const isPreferredStreamDomain = (value) => {
    try {
        return new URL(value).hostname.toLowerCase() === PREFERRED_STREAM_HOST;
    }
    catch {
        return false;
    }
};
const MUSIC_FILE_TYPES = {
    m4a: { prefix: 'C400', extension: '.m4a' },
    128: { prefix: 'M500', extension: '.mp3' },
    320: { prefix: 'M800', extension: '.mp3' },
    ape: { prefix: 'A000', extension: '.ape' },
    flac: { prefix: 'F000', extension: '.flac' },
};
/** One request rarely carries more than a few songs; past this many, failures get the default hint. */
const MAX_PLAYBACK_HINT_LOOKUPS = 10;
/**
 * The song detail as this same session sees it: the restriction and preview fields are computed per
 * account, so another account's (or an anonymous) copy could be wrong. A failure here reads as no
 * detail: the hint stays unconfirmed, and a preview is not asked for.
 */
const songDetailOf = async (http, auth, songmid, phase) => {
    try {
        const data = await callMusicu(http, auth.device, phase, 'music.pf_song_detail_svr', 'get_song_detail_yqq', { song_type: 0, song_mid: songmid }, auth.credential);
        return data.track_info;
    }
    catch {
        return undefined;
    }
};
/**
 * The preview file the official web player asks for when a song only plays as a preview: a single
 * 14-character media id segment, unlike the two-segment full-quality names. Never the songmid.
 */
const previewFilenameOf = (mediaId) => `RS02${mediaId}.mp3`;
/**
 * 试听：每首先查一次单曲详情（并行，最多 `MAX_PLAYBACK_HINT_LOOKUPS` 首，后面的当作查不到），
 * 回能要试听文件的歌和文件名要用的 media id，以及详情确认没有试听文件的歌。
 */
const previewMediaIdsOf = async (http, auth, songmids, mediaId) => {
    const callerMediaId = validMediaIdOf(mediaId);
    const looked = [...new Set(songmids)].slice(0, MAX_PLAYBACK_HINT_LOOKUPS);
    const details = await Promise.all(looked.map((mid) => songDetailOf(http, auth, mid, 'get-preview-detail')));
    const mediaIds = new Map();
    const missing = new Set();
    for (const [index, mid] of looked.entries()) {
        const media = previewMediaIdOf(details[index], callerMediaId);
        if (media)
            mediaIds.set(mid, media);
        else if (previewFileMissingOf(details[index]))
            missing.add(mid);
    }
    return { mediaIds, missing };
};
/**
 * quality=best：先查详情（最多 `MAX_PLAYBACK_HINT_LOOKUPS` 首），再按 flac → 320 → 128 一级一级要，每一级把还没拿到
 * 链接、又有那一级文件的歌合成一个请求；拿到就停，条目标出实际音质。128 一定会要，那一级的结果（含提示）原样回传。
 * 不采用一次要全部文件名、看谁有 purl 的做法：绿钻要 ape 时没文件也会拿到假链接。
 */
const bestPlayUrls = async (http, auth, streamCdnSelector, songmids, mediaId, playbackHintsEnabled) => {
    const unique = [...new Set(songmids)];
    const looked = unique.slice(0, MAX_PLAYBACK_HINT_LOOKUPS);
    const details = await Promise.all(looked.map((mid) => songDetailOf(http, auth, mid, 'get-quality-detail')));
    const levels = new Map(unique.map((mid) => [mid, ['128']]));
    for (const [index, mid] of looked.entries())
        levels.set(mid, bestQualityLevelsOf(details[index]));
    const playUrl = {};
    let pending = unique;
    for (const level of BEST_QUALITY_ORDER) {
        const batch = pending.filter((mid) => levels.get(mid)?.includes(level));
        if (!batch.length)
            continue;
        const result = await getAuthenticatedPlayUrls(http, auth, streamCdnSelector, batch.join(','), level, mediaId, {}, playbackHintsEnabled);
        for (const mid of batch) {
            const entry = result[mid];
            if (entry && (level === '128' || stringOf(dictionaryOf(entry).url)))
                playUrl[mid] = { ...dictionaryOf(entry), quality: level };
        }
        pending = level === '128' ? [] : pending.filter((mid) => !playUrl[mid]);
    }
    return playUrl;
};
const getAuthenticatedPlayUrls = async (http, auth, streamCdnSelector, songmid, quality = 128, mediaId, options = {}, playbackHintsEnabled = true) => {
    const requestedList = songmid
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    if (String(quality) === 'best' && !options.preview)
        return bestPlayUrls(http, auth, streamCdnSelector, requestedList, mediaId, playbackHintsEnabled);
    // 试听只要确认有试听文件的歌；确定没有的回「没有试听」，其他的回「试听不可用」，都不去要。
    const preview = options.preview
        ? await previewMediaIdsOf(http, auth, requestedList, mediaId)
        : undefined;
    const previewMediaIds = preview?.mediaIds;
    let songmidList = previewMediaIds
        ? requestedList.filter((mid) => previewMediaIds.has(mid))
        : requestedList;
    const skipped = Object.fromEntries(requestedList
        .filter((mid) => previewMediaIds && !previewMediaIds.has(mid))
        .map((mid) => [
        mid,
        {
            url: '',
            error: '暂无播放链接',
            restriction: previewUnavailableRestriction(true, preview?.missing.has(mid)),
        },
    ]));
    if (!options.preview && String(quality) === 'ape') {
        const looked = [...new Set(requestedList)].slice(0, MAX_PLAYBACK_HINT_LOOKUPS);
        const details = new Map(await Promise.all(looked.map(async (mid) => [mid, await songDetailOf(http, auth, mid, 'get-quality-detail')])));
        songmidList = requestedList.filter((mid) => {
            const reason = apeFileFailureOf(details.get(mid));
            if (!reason)
                return true;
            skipped[mid] = {
                url: '',
                error: '暂无播放链接',
                restriction: qualityFileRestriction(true, reason),
            };
            return false;
        });
    }
    if (!songmidList.length && (previewMediaIds || String(quality) === 'ape'))
        return skipped;
    const qualityKey = String(quality);
    const fileType = MUSIC_FILE_TYPES[qualityKey] ?? MUSIC_FILE_TYPES[128];
    // `globalThis.crypto` is the Web Crypto API global: identical on Node ≥20, Electron, Cloudflare
    // Workers and the Vercel Edge Runtime, unlike `node:crypto`, which the last of those refuses to
    // deploy a bundle importing at all.
    const guid = globalThis.crypto.randomUUID().replaceAll('-', '');
    const normalizedMediaId = stringOf(mediaId).trim();
    const data = await callMusicu(http, auth.device, 'get-music-play', 'music.vkey.GetVkey', 'UrlGetVkey', {
        // filename 一律是两段识别值：`prefix + songmid + media_mid + extension`。media_mid 缺席时
        // 用 songmid 补上第二段；只送一段的文件名在 vkey server 仍会拿到 purl，但 CDN 端会 403。
        filename: songmidList.map((mid) => previewMediaIds
            ? previewFilenameOf(previewMediaIds.get(mid))
            : `${fileType.prefix}${mid}${normalizedMediaId || mid}${fileType.extension}`),
        guid,
        songmid: songmidList,
        songtype: songmidList.map(() => 0),
        uin: stringOf(auth.credential.str_musicid) || String(auth.credential.musicid),
        ctx: 0,
    }, auth.credential);
    /** 播放链接的域名：先用回应里的 sip，没有就拿第一个 purl 去测 CDN；都没有时回 undefined。 */
    const streamDomainOf = async (payload) => {
        const sip = Array.isArray(payload.sip) ? payload.sip.map(stringOf).filter(Boolean) : [];
        let domain = sip.find((value) => !value.startsWith('http://ws')) ?? sip[0];
        if (!domain) {
            const firstPurl = (Array.isArray(payload.midurlinfo) ? payload.midurlinfo : [])
                .map(dictionaryOf)
                .map((item) => stringOf(item.purl))
                .find(Boolean);
            if (firstPurl) {
                try {
                    // sjy6 is the responsive compatible route observed across authenticated playback. Trying
                    // it first keeps the common Serverless path to one Range request instead of dispatch + N.
                    domain =
                        (await streamCdnSelector.select([PREFERRED_STREAM_DOMAIN], firstPurl)) ?? undefined;
                    if (!domain) {
                        const dispatch = await callMusicu(http, auth.device, 'get-cdn-dispatch', 'music.audioCdnDispatch.cdnDispatch', 'GetCdnDispatch', {
                            guid,
                            uid: '0',
                            use_new_domain: 1,
                            use_ipv6: 1,
                        }, auth.credential);
                        const dispatchSip = Array.isArray(dispatch.sip)
                            ? dispatch.sip.map(stringOf).filter(Boolean)
                            : [];
                        const alternativeSip = dispatchSip.filter((value) => !isPreferredStreamDomain(value));
                        const refreshMs = (numberOf(dispatch.refreshTime) ?? DEFAULT_CDN_REFRESH_MS / 1_000) * 1_000;
                        domain =
                            (await streamCdnSelector.select([...alternativeSip, DEFAULT_STREAM_DOMAIN], firstPurl, refreshMs)) ?? undefined;
                    }
                }
                catch (error) {
                    logger.warn('qq-auth.cdn-selection-failed', {
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }
        }
        return domain;
    };
    const firstDomain = await streamDomainOf(data);
    const domain = firstDomain ?? DEFAULT_STREAM_DOMAIN;
    const playUrl = { ...skipped };
    const entries = Array.isArray(data.midurlinfo) ? data.midurlinfo : [];
    const loggedQuality = options.preview
        ? 'preview'
        : MUSIC_FILE_TYPES[qualityKey]
            ? qualityKey
            : '128';
    const unavailable = [];
    for (const [index, entry] of entries.entries()) {
        const item = dictionaryOf(entry);
        const mid = identifierOf(item.songmid);
        if (!mid)
            continue;
        if (skipped[mid])
            continue;
        const purl = stringOf(item.purl);
        // 开发日志（debug）：没链接的那首只记位置、音质和白名单里的数字，不记歌曲 id。
        if (!purl)
            logger.debug('playback.url-unavailable', playbackUnavailableLogOf({
                phase: 'get-music-play',
                index,
                quality: String(loggedQuality),
                entry: item,
            }));
        if (purl) {
            playUrl[mid] = {
                url: `${domain}${purl}`,
                error: false,
                ...(options.preview ? { preview: true } : {}),
            };
            continue;
        }
        const restriction = {
            ...classifyPlaybackRestriction({
                quality: playbackQualityOf(loggedQuality),
                authenticated: true,
                codes: playbackEntryCodesOf(item),
            }),
        };
        playUrl[mid] = { url: '', error: '暂无播放链接', restriction };
        unavailable.push({ mid, restriction });
    }
    // 试听拿不到链接一律是「试听不可用」；其他的在还没有验证过的规则时挑不出具体原因，不用多查。
    const contextOf = (restriction) => ({
        authenticated: true,
        quality: String(loggedQuality),
        codes: (restriction.codes ?? {}),
    });
    const looked = playbackHintsEnabled && !options.preview && PLAYBACK_HINT_RULES.length
        ? unavailable
            .filter(({ restriction }) => canLookupPlaybackHint(contextOf(restriction)))
            .slice(0, MAX_PLAYBACK_HINT_LOOKUPS)
        : [];
    const details = new Map(await Promise.all(looked.map(async ({ mid }) => [mid, await songDetailOf(http, auth, String(mid), 'get-playback-hint')])));
    for (const { mid, restriction } of unavailable)
        restriction.hint = options.preview
            ? previewUnavailableHint()
            : playbackHintOf(details.get(mid), playbackHintsEnabled ? PLAYBACK_HINT_RULES : [], contextOf(restriction));
    // 原因没确认时再取一次：只在 m4a／128（quality=best 的最后一级也走这里）、最终提示是 reason-unconfirmed 时，
    // 同一会话、同一首、同一音质再要一次，合成一个请求，每首最多多 1 次。地区、会员这些已有具体提示的不再取。
    // 再取仍没给或请求本身出错时，保留第一次的结果，不让整个回应失败。
    const retryList = options.preview || !['m4a', '128'].includes(String(loggedQuality))
        ? []
        : unavailable
            .filter(({ restriction }) => dictionaryOf(restriction.hint).key === 'playback.reason-unconfirmed')
            .map(({ mid }) => String(mid));
    if (retryList.length) {
        try {
            const retry = await callMusicu(http, auth.device, 'get-music-play-retry', 'music.vkey.GetVkey', 'UrlGetVkey', {
                filename: retryList.map((mid) => `${fileType.prefix}${mid}${normalizedMediaId || mid}${fileType.extension}`),
                guid,
                songmid: retryList,
                songtype: retryList.map(() => 0),
                uin: stringOf(auth.credential.str_musicid) || String(auth.credential.musicid),
                ctx: 0,
            }, auth.credential);
            const retrySip = Array.isArray(retry.sip) ? retry.sip.map(stringOf).filter(Boolean) : [];
            const retryDomain = (retrySip.length || !firstDomain ? await streamDomainOf(retry) : firstDomain) ??
                DEFAULT_STREAM_DOMAIN;
            for (const entry of Array.isArray(retry.midurlinfo) ? retry.midurlinfo : []) {
                const item = dictionaryOf(entry);
                const mid = identifierOf(item.songmid);
                const purl = stringOf(item.purl);
                if (mid && purl && retryList.includes(mid))
                    playUrl[mid] = { url: `${retryDomain}${purl}`, error: false };
            }
        }
        catch {
            // 第一次的结果已经在 playUrl 里。
        }
    }
    return playUrl;
};

const DEFAULT_LOGIN_CHANNEL = 'qq';
const NODE_RUNTIME_CAPABILITIES = {
    channels: ['qq', 'wechat'],
    sessionMode: 'stored',
};
/** The channels the Node entry point routes; unchanged, now derived from its capabilities. */
const SUPPORTED_LOGIN_CHANNELS = NODE_RUNTIME_CAPABILITIES.channels;
const isSupportedLoginChannel = (value) => SUPPORTED_LOGIN_CHANNELS.includes(value);
const LEGACY_LOGIN_CHANNEL_ALIASES = new Map([['mobile', 'qq']]);
/** Accepts a canonical channel or a legacy alias and answers with the canonical value. */
const normalizeLoginChannel = (value) => {
    if (isSupportedLoginChannel(value))
        return value;
    return typeof value === 'string' ? LEGACY_LOGIN_CHANNEL_ALIASES.get(value) : undefined;
};

const cloneAuthSession = (session) => ({
    ...session,
    credential: { ...session.credential },
    device: { ...session.device },
});
const isQqCredential = (value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const candidate = value;
    const hasMusicId = (typeof candidate.musicid === 'string' && candidate.musicid.length > 0) ||
        (typeof candidate.musicid === 'number' && Number.isFinite(candidate.musicid));
    return (hasMusicId &&
        typeof candidate.musickey === 'string' &&
        candidate.musickey.length > 0 &&
        typeof candidate.loginType === 'number' &&
        Number.isFinite(candidate.loginType));
};
/** A decrypted record is still untrusted: reject partial or hand-edited credentials on restore. */
const isAuthSession = (value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const candidate = value;
    return (typeof candidate.token === 'string' &&
        candidate.token.length > 0 &&
        isQqCredential(candidate.credential) &&
        isAndroidDevice(candidate.device) &&
        typeof candidate.expiresAt === 'number' &&
        Number.isFinite(candidate.expiresAt));
};
/**
 * Backwards-compatible default for servers that do not opt into persistence. The repository owns
 * copies so callers cannot mutate a stored credential through a previously returned object.
 */
const createMemoryAuthSessionRepository = (seed = []) => {
    let stored = seed.filter(isAuthSession).map(cloneAuthSession);
    return {
        kind: 'memory',
        load: () => stored.map(cloneAuthSession),
        save: (sessions) => {
            stored = sessions.map(cloneAuthSession);
        },
    };
};
/**
 * Keeps repository failures outside the login protocol. A locked keychain or corrupt desktop state
 * must degrade to the previous in-memory behaviour instead of preventing QR login altogether.
 */
const createAuthSessionStore = (initialRepository, now) => {
    let repository = initialRepository;
    const sessions = new Map();
    const persist = () => {
        try {
            repository.save(Array.from(sessions.values(), cloneAuthSession));
        }
        catch (error) {
            logger.warn('qq-auth.auth-session.save-failed', {
                kind: repository.kind,
                name: error instanceof Error ? error.name : 'Error',
            });
        }
    };
    const removeExpired = () => {
        let removed = false;
        const current = now();
        for (const [token, session] of sessions) {
            if (session.expiresAt <= current) {
                sessions.delete(token);
                removed = true;
            }
        }
        return removed;
    };
    const restore = () => {
        let loaded;
        try {
            loaded = repository.load();
        }
        catch (error) {
            logger.warn('qq-auth.auth-session.load-failed', {
                kind: repository.kind,
                name: error instanceof Error ? error.name : 'Error',
            });
            return;
        }
        if (loaded === null || loaded === undefined)
            loaded = [];
        if (!Array.isArray(loaded)) {
            logger.warn('qq-auth.auth-session.invalid-state', { kind: repository.kind });
            return;
        }
        let rejectedCount = 0;
        for (const value of loaded) {
            if (!isAuthSession(value)) {
                rejectedCount += 1;
                continue;
            }
            sessions.set(value.token, cloneAuthSession(value));
        }
        const expiredRemoved = removeExpired();
        logger.info('qq-auth.auth-session.ready', {
            kind: repository.kind,
            restoredCount: sessions.size,
            rejectedCount,
        });
        // Rewrite only when validation pruned records, so corrupt or expired credentials are not
        // repeatedly decrypted and examined on every application launch.
        if (rejectedCount > 0 || expiredRemoved)
            persist();
    };
    restore();
    return {
        get: (token) => sessions.get(token) ?? null,
        set: (session) => {
            sessions.set(session.token, cloneAuthSession(session));
            persist();
        },
        delete: (token) => {
            if (sessions.delete(token))
                persist();
        },
        cleanup: () => {
            if (removeExpired())
                persist();
        },
        useRepository: (nextRepository) => {
            // The npm package starts listening as a side effect of require(). Folia injects its encrypted
            // repository immediately afterwards; preserving any already-created in-memory entries also
            // makes a late-but-valid configuration call lossless.
            const currentSessions = Array.from(sessions.values(), cloneAuthSession);
            sessions.clear();
            repository = nextRepository;
            restore();
            for (const session of currentSessions) {
                if (session.expiresAt > now())
                    sessions.set(session.token, session);
            }
            if (currentSessions.length > 0)
                persist();
        },
    };
};
/**
 * The `stored` backend: a thin adapter over the existing `AuthSessionStore`, which is left exactly
 * as it was. Nothing here re-implements lookup, persistence, expiry or repository swapping — the
 * store still owns all of it, so the six PR #2 behaviour guarantees continue to be enforced by the
 * same code that has always enforced them.
 *
 * The only logic that moves in is minting the token, which `finalizeLogin` used to do inline: the
 * port hands `issue()` a session without one precisely so a sealed backend can derive the token
 * from the credential instead of generating an unrelated identifier.
 */
/**
 * Neutral fallbacks for the three dependencies that used to default to a Node implementation.
 *
 * They exist so this module can be imported by any runtime without dragging `axios`, `ws` or
 * `node:fs` into the dependency closure, which is what made a serverless bundle impossible. Each
 * one fails on use rather than on construction, so a runtime that never touches the QQ App channel
 * — every serverless deployment, which is WeChat-only — is not forced to supply a listener it has
 * no implementation for.
 *
 * 🔴 Node, Electron and Docker never see these: `qrLogin.node.ts` supplies exactly the defaults
 * this module used to apply, so the packaged behaviour is unchanged.
 */
// Written as one string each on purpose. `tests/runtime.dependencies.test.ts` scans this directory
// for import specifiers with a regex, and splitting a literal right after an import keyword makes
// the remainder look like a package name to it.
const MISSING_HTTP_MESSAGE = 'No AuthHttpClient was provided. Node, Electron and Docker take one from the wrapper at `services/auth/qrLogin.node.ts`; a serverless runtime injects its fetch client.';
const MISSING_LISTEN_MESSAGE = 'The QQ App channel needs an MQTT listener and this runtime has none. Node supplies one via the wrapper at `services/auth/qrLogin.node.ts`; a serverless runtime should declare `wechat` only.';
const unavailableHttpClient = () => ({
    getCookieHeader: () => {
        throw new Error(MISSING_HTTP_MESSAGE);
    },
    request: () => {
        throw new Error(MISSING_HTTP_MESSAGE);
    },
    post: () => {
        throw new Error(MISSING_HTTP_MESSAGE);
    },
});
const unavailableListen = () => {
    throw new Error(MISSING_LISTEN_MESSAGE);
};
/**
 * Unlike `http`/`listen` above, `randomBytes` has no "this runtime doesn't need it" case — every
 * runtime mints QR session keys and (under `stored`) auth tokens — so its default has to actually
 * work rather than throw. `globalThis.crypto.getRandomValues` is the Web Crypto primitive Node
 * ≥20, Electron, Cloudflare Workers and the Vercel Edge Runtime all implement identically, unlike
 * `node:crypto`'s `randomBytes`, which the last of those refuses to deploy a bundle importing at
 * all. `qrLogin.node.ts` overrides this with the real `node:crypto` generator for Node, Electron
 * and Docker, exactly as it does for `http` and `listen`; every other caller — including every
 * `createQrLoginService()` call in `src/serverless/index.ts` — gets this one.
 */
const randomBytesNeutral = (size) => Buffer$1.from(globalThis.crypto.getRandomValues(new Uint8Array(size)));
/** Refresh this long before the musickey's own expiry; the old key keeps working meanwhile. */
const AUTH_REFRESH_EARLY_MS = 6 * 60 * 60 * 1000;
/** After a failed refresh, wait this long before trying again instead of retrying per request. */
const AUTH_REFRESH_RETRY_MS = 5 * 60 * 1000;
/**
 * Only a credential that says when it expires and carries a `refresh_key` can be refreshed. The
 * mobile QQ fallback credential (the MQTT ticket) has no `refresh_key`, so it is left alone.
 */
const shouldRefreshStoredCredential = (credential, now) => {
    const expiresAt = credentialExpiryAt(credential);
    return (expiresAt !== null &&
        stringOf(credential.refresh_key).length > 0 &&
        now > expiresAt - AUTH_REFRESH_EARLY_MS);
};
/**
 * The `stored` backend keeps the existing `AuthSessionStore` as the authority for lookup,
 * persistence, expiry and repository swapping. Its resolver layer owns token lifecycle concerns:
 * minting the opaque key and, when a host supplies the hook, refreshing a nearly-expired credential
 * in place under the same token.
 *
 * Silent refresh is deliberately absent from sealed mode: there the credential travels inside the
 * token, so a refresh would have to hand out a new token, which clients cannot take yet.
 */
const createStoredSessionResolver = (options) => {
    const store = createAuthSessionStore(options.repository, options.now);
    const refreshes = new Map();
    const refreshRetryAt = new Map();
    const refresh = async (token, session) => {
        try {
            const credential = await options.refreshCredential?.(cloneAuthSession(session));
            const live = store.get(token);
            // Logout may race an in-flight upstream refresh. Never resurrect a revoked token.
            if (!credential || !live)
                return null;
            const refreshed = {
                ...live,
                credential,
                expiresAt: authSessionExpiryAt(credential, options.now()),
            };
            store.set(refreshed);
            refreshRetryAt.delete(token);
            logger.info('qq-auth.stored-credential-refreshed', {
                credentialLoginType: credential.loginType,
            });
            return store.get(token);
        }
        catch (error) {
            // The old musickey is still usable during the early-refresh window. A transient refresh
            // failure must not turn the final hours into an outage, nor hammer upstream per call.
            refreshRetryAt.set(token, options.now() + AUTH_REFRESH_RETRY_MS);
            logger.warn('qq-auth.stored-credential-refresh-failed', {
                name: error instanceof Error ? error.name : 'Error',
            });
            return store.get(token);
        }
    };
    const resolve = async (token) => {
        if (!token)
            return null;
        const session = store.get(token);
        if (!session) {
            refreshRetryAt.delete(token);
            return null;
        }
        const current = options.now();
        if (!options.refreshCredential ||
            !shouldRefreshStoredCredential(session.credential, current) ||
            (refreshRetryAt.get(token) ?? 0) > current)
            return session;
        const existing = refreshes.get(token);
        if (existing)
            return existing;
        const pending = refresh(token, session);
        refreshes.set(token, pending);
        try {
            return await pending;
        }
        finally {
            if (refreshes.get(token) === pending)
                refreshes.delete(token);
        }
    };
    return {
        mode: 'stored',
        issue: async (session) => {
            const token = options.randomBytes(32).toString('hex');
            store.set({ ...session, token });
            return token;
        },
        resolve,
        revoke: async (token) => {
            store.delete(token);
            refreshRetryAt.delete(token);
        },
        cleanup: () => {
            store.cleanup();
            for (const token of refreshRetryAt.keys()) {
                if (!store.get(token))
                    refreshRetryAt.delete(token);
            }
        },
        useRepository: (repository) => {
            store.useRepository(repository);
            refreshRetryAt.clear();
        },
    };
};
const QR_STATES = [
    'created',
    'creating',
    'waiting',
    'scanned',
    'exchanging',
    'confirmed',
    'expired',
    'failed',
];
/** A restored QR record is untrusted input, exactly like a restored auth session. */
const isQrSessionRecord = (value) => {
    if (!isDictionary(value))
        return false;
    const optionalText = (key) => value[key] === undefined ||
        (typeof value[key] === 'string' && value[key].length > 0);
    return (typeof value.key === 'string' &&
        value.key.length > 0 &&
        isSupportedLoginChannel(value.channel) &&
        QR_STATES.includes(value.state) &&
        Number.isFinite(value.createdAt) &&
        Number.isFinite(value.expiresAt) &&
        ['identifier', 'qrcodeId', 'imageUrl', 'authToken'].every(optionalText));
};
const cloneQrSessionRecord = (session) => ({ ...session });
/** Backwards-compatible default: the process-local map the service has always used. */
const createMemoryQrSessionRepository = (seed = []) => {
    let stored = seed.filter(isQrSessionRecord).map(cloneQrSessionRecord);
    return {
        kind: 'memory',
        load: () => stored.map(cloneQrSessionRecord),
        save: (sessions) => {
            stored = sessions.map(cloneQrSessionRecord);
        },
    };
};
/**
 * Mirrors `AuthSessionStore`: the map stays authoritative in-process and every mutation is
 * mirrored into the repository, whose failures never reach the login protocol.
 */
const createQrSessionStore = (repository) => {
    const sessions = new Map();
    const persist = () => {
        try {
            repository.save(Array.from(sessions.values(), cloneQrSessionRecord));
        }
        catch (error) {
            logger.warn('qq-auth.qr-session.save-failed', {
                kind: repository.kind,
                name: error instanceof Error ? error.name : 'Error',
            });
        }
    };
    let loaded;
    try {
        loaded = repository.load();
    }
    catch (error) {
        logger.warn('qq-auth.qr-session.load-failed', {
            kind: repository.kind,
            name: error instanceof Error ? error.name : 'Error',
        });
    }
    for (const value of Array.isArray(loaded) ? loaded : []) {
        if (isQrSessionRecord(value))
            sessions.set(value.key, cloneQrSessionRecord(value));
    }
    return {
        get: (key) => sessions.get(key) ?? null,
        set: (session) => {
            // Stored by reference on purpose: the service mutates the live record through the same
            // object it has always used, and only the repository ever receives a copy.
            sessions.set(session.key, session);
            persist();
        },
        persist,
        delete: (key) => {
            const removed = sessions.delete(key);
            if (removed)
                persist();
            return removed;
        },
        keys: () => Array.from(sessions.keys()),
        values: () => Array.from(sessions.values()),
    };
};

// Selects a stream base from QQ's dispatch response without exposing signed song URLs in logs.
const PROBE_BYTES = 256 * 1024;
const PROBE_TIMEOUT_MS = 5_000;
const DEFAULT_CACHE_MS = 30 * 60 * 1_000;
const MIN_CACHE_MS = 60 * 1_000;
const MAX_CACHE_MS = 24 * 60 * 60 * 1_000;
const byteLengthOf = (value) => {
    if (value instanceof ArrayBuffer)
        return value.byteLength;
    if (ArrayBuffer.isView(value))
        return value.byteLength;
    return 0;
};
const createStreamUrlProbe = (http) => async (url) => {
    const startedAt = Date.now();
    try {
        const response = await http.request({
            url,
            method: 'GET',
            headers: {
                Accept: '*/*',
                'Accept-Encoding': 'identity',
                Range: `bytes=0-${PROBE_BYTES - 1}`,
            },
            responseType: 'arraybuffer',
            maxContentLength: PROBE_BYTES,
            signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        });
        if (response.status !== 206)
            return null;
        const bytes = byteLengthOf(response.data);
        return bytes > 0 ? { bytes, elapsedMs: Math.max(1, Date.now() - startedAt) } : null;
    }
    catch {
        return null;
    }
};
const normalizeBase = (value) => {
    try {
        const url = new URL(value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:')
            return null;
        const host = url.hostname.toLowerCase();
        if (!host.endsWith('.qqmusic.qq.com') && !host.endsWith('.tc.qq.com'))
            return null;
        url.pathname = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
        url.search = '';
        url.hash = '';
        return url.toString();
    }
    catch {
        return null;
    }
};
class StreamCdnSelector {
    probe;
    now;
    cached = null;
    selecting = null;
    constructor(probe, now = Date.now) {
        this.probe = probe;
        this.now = now;
    }
    async select(candidates, purl, refreshAfterMs = DEFAULT_CACHE_MS) {
        const bases = [...new Set(candidates.map(normalizeBase).filter((value) => value !== null))];
        if (bases.length === 0 || !purl)
            return null;
        if (this.cached && this.cached.expiresAt > this.now() && bases.includes(this.cached.base))
            return this.cached.base;
        if (this.selecting)
            return this.selecting;
        this.selecting = this.measure(bases, purl, refreshAfterMs).finally(() => {
            this.selecting = null;
        });
        return this.selecting;
    }
    // Measures candidates concurrently so a throttled fallback cannot serially delay playback.
    async measure(bases, purl, refreshAfterMs) {
        const results = await Promise.all(bases.map(async (base) => ({
            base,
            result: await this.probe(new URL(purl, base).toString()),
        })));
        const fastest = results
            .filter((entry) => entry.result !== null)
            .sort((left, right) => right.result.bytes / right.result.elapsedMs - left.result.bytes / left.result.elapsedMs)[0];
        if (!fastest)
            return null;
        const cacheMs = Math.min(MAX_CACHE_MS, Math.max(MIN_CACHE_MS, refreshAfterMs));
        this.cached = { base: fastest.base, expiresAt: this.now() + cacheMs };
        return fastest.base;
    }
}

// src/services/auth/qrService.ts
// 从认证入口搬出的同一套实现；协议、状态与对外回包沿用原规则。
const QR_TTL_MS = 3 * 60 * 1000;
/** Every failure cools the next QR down by the same amount; repeated failures never double it. */
const QR_COOLDOWN_MS = 15 * 1000;
/** The upstream explicitly said "too frequent" (login 104604 or an upstream HTTP 429). */
const QR_RATE_LIMITED_COOLDOWN_MS = 30 * 1000;
const LOGIN_RATE_LIMITED_CODE = 104604;
// A fallback's own result replaces the primary one on top, so "too frequent" is looked for in both.
const isRateLimitedFailure = (details) => details.upstreamCode === LOGIN_RATE_LIMITED_CODE ||
    details.upstreamHttpStatus === 429 ||
    details.primaryFailure?.upstreamCode === LOGIN_RATE_LIMITED_CODE;
class QrLoginServiceImpl {
    http;
    playbackHintsEnabled;
    streamCdnSelector;
    createSessionHttp;
    now;
    random;
    capabilities;
    checkBudgetMs;
    drivers;
    qrSessionStore;
    qrRuntimes = new Map();
    sessionResolver;
    deviceStore;
    creatingSession = false;
    nextQrAllowedAt = 0;
    lastQrFailure;
    constructor(dependencies) {
        this.http = dependencies.http ?? unavailableHttpClient();
        this.playbackHintsEnabled = dependencies.playbackHintsEnabled !== false;
        this.streamCdnSelector = new StreamCdnSelector(dependencies.streamUrlProbe ?? createStreamUrlProbe(this.http), dependencies.now ?? Date.now);
        this.createSessionHttp = dependencies.createSessionHttp ?? unavailableHttpClient;
        this.now = dependencies.now ?? Date.now;
        this.random = dependencies.randomBytes ?? randomBytesNeutral;
        this.capabilities = dependencies.capabilities ?? NODE_RUNTIME_CAPABILITIES;
        this.checkBudgetMs = dependencies.checkBudgetMs ?? WECHAT_DEFAULT_POLL_BUDGET_MS;
        this.deviceStore = createDeviceContextStore(dependencies.deviceRepository ?? createMemoryDeviceContextRepository());
        this.sessionResolver =
            dependencies.sessionResolver ??
                createStoredSessionResolver({
                    repository: dependencies.authSessionRepository ?? createMemoryAuthSessionRepository(),
                    now: this.now,
                    randomBytes: this.random,
                    refreshCredential: (session) => refreshLoginCredential(this.http, session.device, session.credential),
                });
        this.qrSessionStore = createQrSessionStore(dependencies.qrSessionRepository ?? createMemoryQrSessionRepository());
        this.drivers = {
            qq: createQqQrDriver({
                http: this.http,
                device: () => this.deviceStore.get(),
                listen: dependencies.listen ?? unavailableListen,
            }),
            wechat: createWechatQrDriver({ http: (session) => this.sessionHttp(session) }),
            ...dependencies.drivers,
        };
    }
    getCapabilities() {
        return this.capabilities;
    }
    runtimeFor(session) {
        const existing = this.qrRuntimes.get(session.key);
        if (existing)
            return existing;
        const driver = this.drivers[session.channel];
        if (!driver)
            throw new QrLoginServiceError(`Unsupported QR login channel: ${session.channel}`, 400);
        const runtime = { driver, pollErrors: 0 };
        this.qrRuntimes.set(session.key, runtime);
        return runtime;
    }
    dropSession(session) {
        // Closing MQTT rejects the listener's pending read. Retire the session first so its late
        // events and rejection cannot turn intentional teardown into another login failure.
        if (!terminalState(session.state))
            session.state = 'expired';
        const runtime = this.qrRuntimes.get(session.key);
        runtime?.listener?.close();
        runtime?.driver.close(session);
        this.qrRuntimes.delete(session.key);
        this.qrSessionStore.delete(session.key);
    }
    cleanup() {
        const current = this.now();
        for (const session of this.qrSessionStore.values()) {
            if (session.expiresAt > current)
                continue;
            // A pull channel has no background timer to raise `timeout` at expiry, so the expiry itself
            // has to keep counting as a failure. Both guards mirror when a push listener would have
            // raised it: only after a code exists to scan, and only if nothing terminal happened first.
            // A key that was issued and abandoned before `createQr` never backed anything off.
            if (!terminalState(session.state) && session.imageUrl !== undefined)
                this.backoff();
            this.dropSession(session);
        }
        this.sessionResolver.cleanup?.();
    }
    backoff(details = { failureStage: 'qr-event', failureReason: 'qr-timeout' }) {
        this.lastQrFailure = failureDetailsOf(details);
        const delay = isRateLimitedFailure(this.lastQrFailure)
            ? QR_RATE_LIMITED_COOLDOWN_MS
            : QR_COOLDOWN_MS;
        this.nextQrAllowedAt = this.now() + delay;
        return delay;
    }
    confirmingQrExists() {
        return this.qrSessionStore.values().some((session) => confirmingState(session.state));
    }
    /**
     * Closes and drops the codes nobody is scanning. Without this a dialog that was opened and shut
     * without a scan would hold the slot for the whole QR TTL, so the next login attempt — including
     * the one after a hard app restart, where no cancel could ever be sent — got a 409 it could not
     * clear by retrying.
     */
    discardPreemptibleSessions() {
        for (const session of this.qrSessionStore.values()) {
            if (terminalState(session.state) || confirmingState(session.state))
                continue;
            this.dropSession(session);
            logger.info('qq-auth.qr-session-preempted', { loginChannel: session.channel });
        }
    }
    sessionFor(key) {
        this.cleanup();
        const session = this.qrSessionStore.get(key);
        if (!session)
            throw new QrLoginServiceError('QR session not found or expired', 404);
        return session;
    }
    async authFor(token) {
        this.cleanup();
        return this.sessionResolver.resolve(token);
    }
    /**
     * Turns a pre-session bootstrap failure into a backed-off client error, so repeated clicks
     * get one 502 with Retry-After and then 429s instead of a stream of upstream calls.
     */
    failBootstrap(error, stage) {
        if (error instanceof QrLoginServiceError)
            return error;
        const bootstrap = error instanceof QqDeviceBootstrapError ? error : null;
        const protocol = error instanceof QqProtocolError ? error : null;
        const diagnostics = qrFailureDetailsOf(error, stage);
        const retryAfterMs = this.backoff(diagnostics);
        const upstreamCode = bootstrap?.outerCode ?? protocol?.upstreamCode;
        logger.warn('qq-auth.bootstrap-failed', {
            phase: bootstrap ? 'qimei' : (protocol?.phase ?? 'unknown'),
            outerCode: bootstrap?.outerCode,
            innerCode: bootstrap?.innerCode,
            upstreamCode: protocol?.upstreamCode,
            retryAfterMs,
            name: error instanceof Error ? error.name : 'Error',
            ...diagnostics,
        });
        return new QrLoginServiceError('Unable to start QR login', 502, retryAfterMs, upstreamCode, diagnostics);
    }
    failSession(session, error, stage) {
        if (terminalState(session.state))
            return;
        session.state = 'failed';
        Object.assign(session, qrFailureDetailsOf(error, stage, session.channel));
        session.retryAfterMs = this.backoff(session);
        this.qrSessionStore.persist();
        logger.warn('qq-auth.session-failed', {
            loginChannel: session.channel,
            retryAfterMs: session.retryAfterMs,
            ...failureDetailsOf(session),
            name: error instanceof Error ? error.name : 'Error',
        });
    }
    /** QQ App channel: the MQTT payload carries an exchange token, never the final credential. */
    async exchangeQqLogin(session, payload) {
        session.failureStage = 'credential-payload';
        logQqCookies(payload);
        const cookies = dictionaryOf(dictionaryOf(payload).cookies);
        const musicid = stringOf(dictionaryOf(cookies.qqmusic_uin).value);
        const mqttToken = stringOf(dictionaryOf(cookies.qqmusic_key).value);
        if (!musicid || !mqttToken || !session.qrcodeId)
            throw new Error('MQTT cookies missing login credential');
        session.state = 'exchanging';
        const device = this.deviceStore.get();
        session.failureStage = 'credential-exchange';
        try {
            return await exchangeCredential(this.http, device, session.qrcodeId, musicid, mqttToken);
        }
        catch (error) {
            // The fallback below replaces this failure on top whatever it returns, so it is kept here.
            session.primaryFailure = primaryFailureOf(error, 'credential-exchange', session.channel);
            session.fallbackAttempted = true;
            session.failureStage = 'credential-validation';
            const direct = {
                musicid,
                str_musicid: musicid,
                musickey: mqttToken,
                loginType: MOBILE_LOGIN_TYPE,
            };
            await getLoginUser(this.http, {
                credential: direct,
                device});
            logger.warn('qq-auth.exchange-fallback', {
                upstreamCode: error instanceof QqProtocolError ? error.upstreamCode : undefined,
            });
            return direct;
        }
    }
    /** WeChat channel: the web flow yields an OAuth code, and there is no MQTT fallback. */
    async exchangeWechatLogin(session, payload) {
        session.failureStage = 'credential-payload';
        const code = stringOf(dictionaryOf(payload).code);
        if (!code)
            throw new WechatQrError('WeChat authorization missing code');
        session.state = 'exchanging';
        session.failureStage = 'credential-exchange';
        return exchangeWechatCredential(this.http, this.deviceStore.get(), code);
    }
    async finalizeLogin(session, payload) {
        let credential = session.channel === 'wechat'
            ? await this.exchangeWechatLogin(session, payload)
            : await this.exchangeQqLogin(session, payload);
        if (session.channel === 'wechat') {
            session.failureStage = 'credential-validation';
            credential = await validateWechatCredential(this.http, this.deviceStore.get(), credential);
        }
        session.failureStage = 'session-issue';
        const token = await this.sessionResolver.issue({
            credential,
            device: this.deviceStore.get(),
            expiresAt: authSessionExpiryAt(credential, this.now()),
        });
        session.authToken = token;
        session.failureStage = undefined;
        session.failureReason = undefined;
        session.primaryFailure = undefined;
        session.fallbackAttempted = undefined;
        session.state = 'confirmed';
        this.qrSessionStore.persist();
        this.nextQrAllowedAt = 0;
        this.lastQrFailure = undefined;
        logger.info('qq-auth.login-confirmed', {
            loginChannel: session.channel,
            hasCredential: true,
            credentialLoginType: credential.loginType,
            credentialKeys: Object.keys(credential).sort(),
            credentialKeyLength: credential.musickey.length,
        });
    }
    onQrEvent(session, event) {
        if (terminalState(session.state))
            return;
        const previousState = session.state;
        // A later WeChat waiting response is not evidence that the phone's scan was undone.
        // Keep the QQ listener's existing semantics and still accept cancellation/expiry events.
        if (session.channel === 'wechat' &&
            event.type === 'waiting' &&
            confirmingState(session.state)) {
            logWechatQr(session, 'qr-state', {
                eventType: 'waiting',
                previousState,
                state: session.state,
                ignored: true,
            });
            return;
        }
        if (event.type === 'waiting')
            session.state = 'waiting';
        else if (event.type === 'scanned')
            session.state = 'scanned';
        else if (event.type === 'cookies' || event.type === 'authorized') {
            const runtime = this.runtimeFor(session);
            // Started the same way for both driver modes. A push channel leaves it running in the
            // background exactly as before; a pull channel awaits it inside the same `advance()` so an
            // invocation never ends with the credential exchange still in flight.
            runtime.finalizing = this.finalizeLogin(session, event.payload).catch((error) => this.failSession(session, error, session.failureStage ?? 'credential-exchange'));
            void runtime.finalizing;
        }
        else if (['canceled', 'timeout', 'loginFailed'].includes(event.type ?? '')) {
            session.state = 'expired';
            session.failureStage = 'qr-event';
            session.failureReason =
                event.type === 'canceled'
                    ? 'user-canceled'
                    : event.type === 'timeout'
                        ? 'qr-timeout'
                        : 'login-rejected';
            session.retryAfterMs = this.backoff(session);
        }
        this.qrSessionStore.persist();
        if (session.channel === 'wechat' && session.state !== previousState) {
            const eventType = event.type === 'waiting' ||
                event.type === 'scanned' ||
                event.type === 'authorized' ||
                event.type === 'cookies' ||
                event.type === 'canceled' ||
                event.type === 'timeout' ||
                event.type === 'loginFailed'
                ? event.type
                : 'unknown';
            logWechatQr(session, 'qr-state', {
                eventType,
                previousState,
                state: session.state,
                ignored: false,
            });
        }
    }
    /**
     * Gives a pull channel its one time-boxed look at the upstream. Push channels have already
     * delivered whatever arrived, so this is a no-op for them.
     */
    async advanceSession(session, budgetMs) {
        const runtime = this.runtimeFor(session);
        if (runtime.driver.mode !== 'pull' || terminalState(session.state))
            return;
        let events;
        try {
            events = await runtime.driver.advance(session, budgetMs);
            runtime.pollErrors = 0;
        }
        catch (error) {
            // A dropped long poll is normal; only a run of them fails the session. This is the same
            // tolerance the self-driving WeChat loop applied before it became a pull driver.
            runtime.pollErrors += 1;
            if (runtime.pollErrors > MAX_CONSECUTIVE_POLL_ERRORS)
                this.failSession(session, error, 'qr-poll');
            return;
        }
        for (const event of events)
            this.onQrEvent(session, event);
        await runtime.finalizing;
    }
    async createSession(channel = DEFAULT_LOGIN_CHANNEL) {
        // Normalizing here rather than deeper in is what keeps the legacy alias a boundary concern:
        // every field, log and comparison below this line only ever sees a canonical channel.
        const loginChannel = normalizeLoginChannel(channel);
        // Validated against this runtime's declared capabilities, not a module-level constant, so a
        // runtime that cannot serve a channel rejects it instead of failing further in.
        if (!loginChannel || !this.capabilities.channels.includes(loginChannel))
            throw new QrLoginServiceError(`Unsupported QR login channel: ${channel}`, 400);
        this.cleanup();
        const retryAfterMs = Math.max(0, this.nextQrAllowedAt - this.now());
        if (retryAfterMs > 0)
            throw new QrLoginServiceError('QR login is temporarily backed off', 429, retryAfterMs, undefined, {
                failureStage: 'qr-key',
                failureReason: 'local-backoff',
                lastFailure: this.lastQrFailure,
            });
        // The concurrency lock and a QR that is mid-confirmation are the only real 409s left.
        if (this.creatingSession || this.confirmingQrExists())
            throw new QrLoginServiceError('Another QR login is already active', 409, undefined, undefined, {
                failureStage: 'qr-key',
                failureReason: 'session-busy',
            });
        this.discardPreemptibleSessions();
        this.creatingSession = true;
        let stage = 'device-bootstrap';
        try {
            const device = this.deviceStore.get();
            if (await ensureQimei(this.http, device, this.now()))
                this.deviceStore.persist();
            stage = 'session-bootstrap';
            await refreshAndroidSession(this.http, device);
            this.deviceStore.persist();
            const key = this.random(24).toString('hex');
            this.qrSessionStore.set({
                key,
                channel: loginChannel,
                state: 'created',
                createdAt: this.now(),
                expiresAt: this.now() + QR_TTL_MS,
            });
            logger.info('qq-auth.qr-session-created', { loginChannel });
            return key;
        }
        catch (error) {
            throw this.failBootstrap(error, stage);
        }
        finally {
            this.creatingSession = false;
        }
    }
    /**
     * Releases one QR session by key. Keyed on purpose: clearing every session would let one client
     * closing its dialog kill a QR another client is confirming on their phone.
     */
    cancelSession(key) {
        const session = this.qrSessionStore.get(key);
        // Idempotent by contract. The client cancels on dialog close as fire-and-forget, so an unknown
        // or already expired key is a success, never a 404.
        if (!session)
            return;
        // A confirmed session is left to expire on its own: the credential already reached authSessions
        // and a poll still in flight has to keep reading 803 rather than flip a login into "expired".
        if (session.state === 'confirmed')
            return;
        this.dropSession(session);
        logger.info('qq-auth.qr-session-canceled', { loginChannel: session.channel });
    }
    sessionHttp(session) {
        const runtime = this.runtimeFor(session);
        if (!runtime.http)
            runtime.http = this.createSessionHttp();
        return runtime.http;
    }
    async createQr(key) {
        const session = this.sessionFor(key);
        if (session.imageUrl)
            return session.imageUrl;
        if (session.state !== 'created')
            throw new QrLoginServiceError('QR session cannot create another code', 409);
        const runtime = this.runtimeFor(session);
        session.state = 'creating';
        let stage = 'qr-create';
        try {
            const qr = await runtime.driver.createQr(session);
            session.identifier = qr.identifier;
            if (session.channel === 'qq')
                session.qrcodeId = qr.identifier;
            session.imageUrl = qr.imageUrl;
            if (qr.expiresIn && qr.expiresIn > 0) {
                session.expiresAt = Math.min(session.expiresAt, this.now() + qr.expiresIn * 1000);
            }
            logger.info('qq-auth.qr-created', {
                loginChannel: session.channel,
                qrIdentifierLength: qr.identifier.length,
            });
            if (runtime.driver.start) {
                stage = 'mqtt-listener';
                // The listener deadline is still computed after `expiresIn` narrowed the record, which is
                // exactly the order the pre-driver implementation used.
                const listener = runtime.driver.start(session, {
                    onEvent: (event) => this.onQrEvent(session, event),
                    timeoutMs: session.expiresAt - this.now(),
                });
                runtime.listener = listener;
                void listener.done.catch((error) => this.failSession(session, error, 'mqtt-listener'));
                await listener.ready;
            }
            else {
                // A pull channel is scannable the moment the code exists. The self-driving loop it
                // replaces emitted this same event before its first poll.
                this.onQrEvent(session, { type: 'waiting', payload: null });
            }
            this.qrSessionStore.persist();
            return qr.imageUrl;
        }
        catch (error) {
            this.failSession(session, error, stage);
            throw new QrLoginServiceError('Unable to create QR login', 502, session.retryAfterMs, session.upstreamCode, failureDetailsOf(session));
        }
    }
    async checkQr(key, budgetMs = this.checkBudgetMs) {
        try {
            const session = this.sessionFor(key);
            await this.advanceSession(session, budgetMs);
            if (session.state === 'confirmed' && session.authToken) {
                return this.observedCheckResult(session, {
                    code: 803,
                    message: 'Authorization login successful',
                    cookie: `qqmusic_session=${session.authToken}`,
                });
            }
            if (session.state === 'scanned' || session.state === 'exchanging')
                return this.observedCheckResult(session, { code: 802, message: 'QR code scanned' });
            if (session.state === 'expired' || session.state === 'failed')
                return this.observedCheckResult(session, this.failedCheckResult(session));
            return this.observedCheckResult(session, { code: 801, message: 'Waiting for QR scan' });
        }
        catch {
            return { code: 800, message: 'QR code expired' };
        }
    }
    observedCheckResult(session, result) {
        if (session.channel !== 'wechat')
            return result;
        const failure = failureDetailsOf(session);
        logWechatQr(session, 'qr-check', {
            state: session.state,
            apiCode: result.code,
            sessionMode: this.capabilities.sessionMode,
            pollErrors: this.qrRuntimes.get(session.key)?.pollErrors ?? 0,
            failureStage: failure.failureStage,
            failureReason: failure.failureReason,
        });
        return result;
    }
    failedCheckResult(session) {
        return {
            code: 800,
            message: session.state === 'expired' ? 'QR code expired' : 'QR login failed',
            ...(session.retryAfterMs === undefined ? {} : { retryAfterMs: session.retryAfterMs }),
            ...failureDetailsOf(session),
        };
    }
    /**
     * `/login/status` 在没有可用会话时回 200 加一个空载荷，客户端靠 `data.profile` 在不在判断登录态。
     * 因此凭证被上游拒绝时这里回报「未登录」而不是抛错，让它和「根本没带 token」走同一条路；其余需要
     * 登录的路由仍然回 401。
     */
    async getLoginStatus(token) {
        const auth = await this.authFor(token);
        if (!auth)
            return null;
        try {
            return await withCredentialRejectionMapped(() => getLoginProfile(this.http, auth));
        }
        catch (error) {
            if (error instanceof AuthCredentialRejectedError)
                return null;
            throw error;
        }
    }
    async getUserDetail(token) {
        const auth = await this.authFor(token);
        return auth ? withCredentialRejectionMapped(() => getLoginProfile(this.http, auth)) : null;
    }
    async getUserPlaylists(token, uin, options = {}) {
        const auth = await this.authFor(token);
        if (!auth)
            return null;
        // 只支持登录账号本身：别人的 uid 以前会让自建歌单读对方、收藏歌单读自己，两边混在一起。
        if (uin !== undefined && uin.trim() !== '' && !isOwnAccountId(auth.credential, uin))
            throw new RequestRejectedError('uid must be the logged-in account');
        return withCredentialRejectionMapped(() => getPlaylists(this.http, auth, options.favoriteOffset ?? 0, options.playCount === true));
    }
    async getUserAlbums(token, offset, limit) {
        const auth = await this.authFor(token);
        return auth
            ? withCredentialRejectionMapped(() => getFavoriteAlbums(this.http, auth, offset, limit))
            : null;
    }
    async getUserLikedSongs(token, offset, limit) {
        const auth = await this.authFor(token);
        return auth
            ? withCredentialRejectionMapped(() => getLikedSongs(this.http, auth, offset, limit))
            : null;
    }
    async getOwnedPlaylistSongs(token, params = {}) {
        const auth = await this.authFor(token);
        return auth
            ? withCredentialRejectionMapped(() => getOwnedPlaylistSongs$1(this.http, auth, params))
            : null;
    }
    async getAuthenticatedSongListDetail(token, disstid, options = {}) {
        const id = positiveIdOf$2(disstid);
        if (!id)
            return null;
        const auth = await this.authFor(token);
        return auth
            ? withCredentialRejectionMapped(() => getAuthenticatedSongListDetail(this.http, auth, id, options.limit))
            : null;
    }
    async getMusicPlay(token, songmid, quality, mediaId, options) {
        const auth = await this.authFor(token);
        return auth
            ? withCredentialRejectionMapped(() => getAuthenticatedPlayUrls(this.http, auth, this.streamCdnSelector, songmid, quality, mediaId, options, this.playbackHintsEnabled))
            : null;
    }
    async resolveSession(token) {
        return this.authFor(token);
    }
    /**
     * Electron's lifeline, unchanged in shape. A sealed resolver has no repository to swap, so the
     * call is a no-op there rather than an error: the hook exists for hosts that keep credentials on
     * the server, and a runtime that does not is not misconfigured for ignoring it.
     */
    configureAuthSessionRepository(repository) {
        this.sessionResolver.useRepository?.(repository);
    }
    async logout(token) {
        if (token)
            await this.sessionResolver.revoke(token);
        for (const session of this.qrSessionStore.values())
            this.dropSession(session);
    }
}
const createQrLoginService = (dependencies = {}) => new QrLoginServiceImpl(dependencies);

/** 匿名请求用网页端的 comm，和曲库路由一样；2026-10 实测推荐歌单匿名可读。 */
const ANONYMOUS_COMM = { ct: 24, cv: 0 };
const createSessionMusicuClient = (session, options = {}) => {
    const http = createFetchTransport(options.fetcher);
    if (!session)
        return createMusicuClient({
            http,
            comm: options.anonymousUin === 0 ? { ...ANONYMOUS_COMM, uin: 0 } : ANONYMOUS_COMM,
        });
    // 和既有的带凭证请求同一套 comm、User-Agent 与 Cookie。
    return createMusicuClient({
        http,
        comm: buildAndroidComm(session.device, session.credential),
        headers: {
            'User-Agent': `QQMusic 14090008(android ${session.device.osRelease})`,
            Cookie: credentialCookieHeader(session.credential),
        },
        maxRetries: options.maxRetries,
    });
};

/** 只处理专辑 owner；不从已经失真的 number 回建账号，也不改变其他接口的 uin。 */
const albumOwnerOf = (credential) => {
    const stringId = typeof credential.str_musicid === 'string' ? credential.str_musicid.trim() : '';
    const value = stringId && stringId !== '0' ? stringId : credential.musicid;
    let uin;
    if (typeof value === 'number') {
        if (!Number.isSafeInteger(value) || value <= 0)
            throw new QqApiError('invalid-response');
        uin = String(value);
    }
    else if (typeof value === 'string')
        uin = value.trim();
    else
        throw new QqApiError('invalid-response');
    if (!/^\d{1,19}$/.test(uin) || BigInt(uin) === 0n)
        throw new QqApiError('invalid-response');
    const exact = BigInt(uin);
    // 仅已证明安全的值转 number，保持既有协议；超范围字符串的上游接受度仍待验证。
    return { uin, statusUin: exact <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(exact) : uin };
};

const positiveIntegerOf = (value) => {
    const number = typeof value === 'string' && /^\d{1,15}$/.test(value) ? Number(value) : value;
    return typeof number === 'number' && Number.isSafeInteger(number) && number > 0
        ? number
        : undefined;
};
const exactObjectOf = (value, keys) => {
    if (!isDictionary(value) || Object.keys(value).some((key) => !keys.includes(key)))
        throw new QqApiError('input');
    return value;
};
/** 已确认的曲库输入编码器。以后新增类型需独立验证编码，不沿用读取条目的 type/songtype。 */
const SONG_ENCODERS = new Map([[0, (id) => ({ songId: id, songType: 0 })]]);
const playlistSongOf = (value) => {
    const input = exactObjectOf(value, ['id', 'type']);
    const id = positiveIntegerOf(input.id);
    const encoder = typeof input.type === 'number' ? SONG_ENCODERS.get(input.type) : undefined;
    if (id === undefined || !encoder)
        throw new QqApiError('input');
    return encoder(id);
};

const albumSubscribeResult = async (session, raw, options = {}) => {
    try {
        if (!session)
            throw new QqApiError('auth-missing');
        const input = exactObjectOf(raw, ['id', 'subscribed']);
        if (typeof input.id !== 'string' ||
            !/^[A-Za-z0-9]{1,64}$/.test(input.id) ||
            typeof input.subscribed !== 'boolean')
            throw new QqApiError('input');
        const id = input.id, subscribed = input.subscribed;
        const { uin, statusUin } = albumOwnerOf(session.credential);
        const client = createSessionMusicuClient(session, { ...options, maxRetries: 0 });
        const read = () => client.execute({
            module: 'music.musicasset.AlbumFavRead',
            method: 'IsAlbumFan',
            param: { uin: statusUin, v_albumMid: [id] },
            readOnly: true,
            operation: 'subscription.album-status',
            decode: (data) => {
                if (!isDictionary(data) ||
                    !isDictionary(data.m_fan) ||
                    typeof data.m_fan[id] !== 'boolean')
                    throw new QqApiError('invalid-response');
                return data.m_fan[id];
            },
        });
        if ((await read()) === subscribed)
            return okResult({ subscribed });
        await client.execute({
            module: 'music.musicasset.AlbumFavWrite',
            method: subscribed ? 'FavAlbum' : 'CancelFavAlbum',
            param: { uin, v_albumMid: [id] },
            readOnly: false,
            operation: subscribed ? 'album.subscribe' : 'album.unsubscribe',
            decode: (data) => {
                if (!isDictionary(data) ||
                    data.result !== 0 ||
                    !Array.isArray(data.v_failedAlbumId) ||
                    data.v_failedAlbumId.length ||
                    !Array.isArray(data.v_failedAlbumMid) ||
                    data.v_failedAlbumMid.length)
                    throw new QqApiError('invalid-response');
                return undefined;
            },
        });
        if ((await read()) !== subscribed)
            throw new QqApiError('invalid-response');
        return okResult({ subscribed });
    }
    catch (error) {
        const safe = error instanceof QqApiError
            ? error.kind === 'rate-limited'
                ? new QqApiError('upstream-business', {
                    ...error.toJSON(),
                    errorKey: 'upstream.unknown',
                    retryable: false,
                })
                : error
            : new QqApiError('invalid-response');
        const result = failureResult('album-subscribe', safe);
        return { ...result, body: { ...result.body, retryable: false } };
    }
};

const albumSubscribe = async (request) => {
    if (request.method !== 'POST')
        return {
            status: 405,
            headers: { Allow: 'POST' },
            body: { code: 405, message: 'POST required' },
        };
    const session = await (await request.service()).resolveSession(request.token);
    if (!session)
        return toNewRouteErrorResponse(new QqApiError('auth-missing'));
    try {
        return albumSubscribeResult(session, await request.body?.());
    }
    catch {
        return toNewRouteErrorResponse(new QqApiError('input'));
    }
};

/** 日志只留结构与白名单数字，不保留参数值、正文或动态响应键。两个宿主可共用。 */
const valueStructureOf = (value) => {
    if (value === null || value === undefined)
        return value;
    if (Array.isArray(value))
        return { type: 'array', count: value.length };
    if (typeof value === 'object')
        return { type: 'object', count: Object.keys(value).length };
    if (typeof value === 'string')
        return { type: 'string', length: value.length, count: value ? value.split(',').length : 0 };
    return { type: typeof value };
};
const parameterStructureOf = (value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, valueStructureOf(item)]))
    : valueStructureOf(value);
const upstreamRouteOf = (input) => {
    const path = new URL(input, 'http://qq-music-api.local').pathname;
    return /^\/(?:cgi-bin|splcloud)\/[A-Za-z0-9_./-]+\.(?:fcg|cgi)$/.test(path) ? path : '/:upstream';
};
const resultStructureOf = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return valueStructureOf(value);
    const record = value;
    const codes = Object.fromEntries(['code', 'result', 'subcode', 'errtype', 'status', 'total', 'retryAfterMs'].flatMap((key) => {
        const item = record[key];
        return typeof item === 'number' && Number.isSafeInteger(item) ? [[key, item]] : [];
    }));
    return { type: 'object', count: Object.keys(record).length, ...codes };
};
const legacyRequestStructureOf = (url, method, options) => {
    const params = options.params && typeof options.params === 'object'
        ? options.params
        : {};
    let payload = params.data ?? options.data;
    try {
        if (typeof payload === 'string')
            payload = JSON.parse(payload);
    }
    catch {
        payload = undefined;
    }
    const rpc = payload && typeof payload === 'object'
        ? Object.entries(payload)
            .filter(([key]) => key !== 'comm')
            .flatMap(([, item]) => {
            if (!item || typeof item !== 'object')
                return [];
            const call = item;
            if (typeof call.module !== 'string' || typeof call.method !== 'string')
                return [];
            return [
                {
                    module: call.module,
                    method: call.method,
                    params: parameterStructureOf(call.param),
                },
            ];
        })
        : [];
    return {
        route: upstreamRouteOf(url),
        method,
        params: parameterStructureOf(params),
        ...(rpc.length ? { rpc } : {}),
    };
};

const isPlainObject = (value) => Object.prototype.toString.call(value) === '[object Object]';
// 跨 realm 的 Error 与 DOMException 不一定通过 instanceof，按内部标签一起认。
const isErrorLike = (value) => value instanceof Error ||
    ['[object Error]', '[object DOMException]'].includes(Object.prototype.toString.call(value));
const summarizeValue = (value) => {
    if (value === null || value === undefined)
        return value;
    // 原始异常的 message、stack、config 都可能带着地址和凭证，日志里只留白名单摘要。
    if (isErrorLike(value))
        return summarizeError(value);
    if (Buffer.isBuffer(value)) {
        return {
            type: 'buffer',
            length: value.length,
        };
    }
    if (isPlainObject(value))
        return resultStructureOf(value);
    return valueStructureOf(value);
};
const compactRecord = (record) => Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== null));
const createServiceMeta = (service, upstream, params) => compactRecord({
    scope: 'service',
    service,
    upstream,
    params: params === undefined ? undefined : parameterStructureOf(params),
});
const logServiceRequest = (service, upstream, params, extras = {}) => {
    logger.info('service.requesting', {
        ...createServiceMeta(service, upstream, params),
        ...compactRecord(extras),
    });
};
const logServiceSuccess = (service, upstream, result, extras = {}) => {
    logger.info('service.succeeded', {
        ...createServiceMeta(service, upstream),
        result: summarizeValue(result),
        ...compactRecord(extras),
    });
};
const logServiceFailure = (service, upstream, error, params, extras = {}) => {
    logger.error('service.failed', {
        ...createServiceMeta(service, upstream, params),
        error: summarizeValue(error),
        ...compactRecord(extras),
    });
};
const logServiceBranch = (service, upstream, branch, details = {}) => {
    logger.debug('service.branch_selected', {
        ...createServiceMeta(service, upstream),
        branch,
        ...compactRecord(details),
    });
};

const MISSING_TRANSPORT_MESSAGE = 'Legacy QQ HTTP transport is not registered. Register one in the composition root before ' +
    'calling a catalog service: Node, Electron and Docker load `src/app.ts`, which calls ' +
    '`setLegacyHttpTransport(createAxiosLegacyTransport())`; the serverless runtime registers its ' +
    'fetch transport from `src/serverless`. Tests register the axios transport in `tests/setup.ts`.';
let registered = null;
const setLegacyHttpTransport = (transport) => {
    registered = transport;
};
const getLegacyHttpTransport = () => {
    if (!registered)
        throw new Error(MISSING_TRANSPORT_MESSAGE);
    return registered;
};

var y_common = ({ url, method = 'get', options = {}, hasCommonParams = true, }) => {
    // See `u_common.ts`: defaults come from the registered transport, never from `../config`.
    const transport = getLegacyHttpTransport();
    const commonParams = hasCommonParams ? transport.defaults.commonParams : {};
    const opts = Object.assign({}, options, commonParams, {
        headers: {
            referer: transport.defaults.referer.c,
            host: 'c.y.qq.com',
            ...options.headers,
        },
    });
    logger.debug('upstream.request-structure', legacyRequestStructureOf(url, method, opts));
    return transport.request(url, method, opts);
};

const upstream$2 = '/v8/fcg-bin/fcg_v8_album_info_cp.fcg';
var getAlbumInfoService = ({ method = 'get', params = {}, options = {}, }) => {
    const data = Object.assign(params, {
        format: 'json',
        outCharset: 'utf-8',
    });
    const opts = Object.assign(options, {
        params: data,
    });
    logServiceRequest('getAlbumInfo', upstream$2, data);
    return y_common({
        url: upstream$2,
        method,
        options: opts,
    })
        .then((res) => {
        const response = res.data;
        logServiceSuccess('getAlbumInfo', upstream$2, response);
        return {
            status: 200,
            body: {
                response,
            },
        };
    })
        .catch((error) => {
        logServiceFailure('getAlbumInfo', upstream$2, error, data);
        return {
            status: 500,
            body: {
                error: toLegacyErrorBody(error),
            },
        };
    });
};

// src/routes/operations/getAlbumInfo.ts
//
// 专辑信息。上游有应答就照原样包在 `response` 里回 200，业务码不是 0 也一样（Folia 自己看
// `response.code`）；上游连不上才是旧路由的安全 500。
//
// albummid 读 `queryRaw`，保留两边原来的取法：Node 遇到重复的参数会把整个数组交给上游，
// serverless 只取第一个。要统一就是行为改变，不在这里做。
const getAlbumInfo = async ({ queryRaw }) => {
    const albummid = queryRaw('albummid');
    if (!albummid)
        return { status: 400, headers: {}, body: { data: { message: 'no albummid' } } };
    const { status, body } = await getAlbumInfoService({
        method: 'get',
        params: { albummid },
        options: {},
    });
    return { status, headers: {}, body };
};

// [01:27.96]
const timeExp = /\[(\d{2,}):(\d{2})(?:\.(\d{2,3}))?]/g;
const TAGREGMAP = {
    title: 'ti',
    artist: 'ar',
    album: 'al',
    offset: 'offset',
    by: 'by',
};
class Lyric {
    lyric;
    tags;
    lines;
    constructor(lyric, tags = {}, lines = []) {
        this.lyric = lyric;
        this.tags = tags;
        this.lines = lines;
        this._init();
    }
    _init() {
        this._initTag();
        this._initLines();
    }
    _initTag() {
        for (const tag in TAGREGMAP) {
            const tagKey = tag;
            const matches = this.lyric.match(new RegExp(`\\[${TAGREGMAP[tagKey]}:([^\\]]*)]`, 'i'));
            this.tags[tag] = matches?.[1] || '';
        }
    }
    _initLines() {
        const lines = this.lyric.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Reset lastIndex because timeExp has 'g' flag
            timeExp.lastIndex = 0;
            let result = timeExp.exec(line);
            while (result !== null) {
                const txt = line.replace(/\[(\d{2,}):(\d{2})(?:\.(\d{2,3}))?]/g, '').trim();
                const time = Number(result[1]) * 60 * 1000 + Number(result[2]) * 1000 + Number(result[3] || 0) * 10;
                if (txt) {
                    this.lines.push({
                        time,
                        txt,
                    });
                }
                result = timeExp.exec(line);
            }
        }
        this.lines.sort((a, b) => {
            return a.time - b.time;
        });
    }
}
function lyricParse(lyricString) {
    return new Lyric(lyricString);
}
var lyricParse$1 = {
    Lyric,
    lyricParse,
};

const upstream$1 = '/lyric/fcgi-bin/fcg_query_lyric_new.fcg';
/** 上游给的是 UTF-8 文字的 base64；两个运行时都有 atob 与 TextDecoder，不依赖 Node 的 Buffer。 */
const decodeBase64Utf8 = (value) => new TextDecoder().decode(Uint8Array.from(atob(value), (character) => character.charCodeAt(0)));
var getLyric = ({ method = 'get', params = {}, options = {}, isFormat = false, }) => {
    const data = Object.assign(params, {
        format: 'json',
        outCharset: 'utf-8',
        pcachetime: Date.now(),
    });
    const opts = Object.assign(options, {
        params: data,
    });
    logServiceRequest('getLyric', upstream$1, data, {
        formatLyric: isFormat,
    });
    if (isFormat) {
        logServiceBranch('getLyric', upstream$1, 'format', {
            formatLyric: true,
        });
    }
    return y_common({
        url: upstream$1,
        method,
        options: opts,
    })
        .then((res) => {
        const lyricString = res.data?.lyric && decodeBase64Utf8(res.data.lyric);
        const lyric = isFormat ? lyricParse$1.lyricParse(lyricString || '') : lyricString;
        const response = {
            ...(res.data || {}),
            lyric,
        };
        logServiceSuccess('getLyric', upstream$1, {
            code: res.data?.code,
            hasLyric: Boolean(lyricString),
            formatLyric: isFormat,
        });
        return {
            status: 200,
            body: {
                response,
            },
        };
    })
        .catch((error) => {
        logServiceFailure('getLyric', upstream$1, error, data, {
            formatLyric: isFormat,
        });
        return {
            status: 500,
            body: {
                error: toLegacyErrorBody(error),
            },
        };
    });
};

// src/routes/operations/getLyric.ts
// 歌词原样转交，回包形状和 Node 的旧控制器一样；重复参数只取第一项。
const firstOf = (value) => Array.isArray(value) ? value[0] : value;
const getLyricOperation = async ({ queryRaw }) => {
    const songmid = firstOf(queryRaw('songmid'));
    const isFormat = firstOf(queryRaw('isFormat'));
    if (!songmid)
        return { status: 400, headers: {}, body: { response: 'no songmid' } };
    const { status, body } = await getLyric({
        method: 'get',
        params: { songmid },
        isFormat: isFormat === 'true' || isFormat === '1',
    });
    return { status, headers: {}, body };
};

var u_common = ({ options = {}, method = 'get' }) => {
    // The registered transport owns both execution and the request defaults. Reading them from
    // `../config` here is what pulled the filesystem-backed config manager into the serverless
    // dependency graph (M0 0.2).
    const transport = getLegacyHttpTransport();
    const { baseURL, commonParams, referer } = transport.defaults;
    const opts = Object.assign({}, options, commonParams, {
        headers: {
            referer: referer.u,
            host: 'u.y.qq.com',
            'content-type': 'application/x-www-form-urlencoded',
            ...options.headers,
        },
    });
    logger.debug('upstream.request-structure', legacyRequestStructureOf(baseURL.u, method, opts));
    return transport.request(baseURL.u, method, opts, 'u');
};

var UCommon = ({ method = 'get', params = {}, option = {} }) => {
    const options = Object.assign(option, { params });
    return u_common({ method, options });
};

const fileType = {
    m4a: { s: 'C400', e: '.m4a' },
    128: { s: 'M500', e: '.mp3' },
    320: { s: 'M800', e: '.mp3' },
    ape: { s: 'A000', e: '.ape' },
    flac: { s: 'F000', e: '.flac' },
};
const MAX_HINT_LOOKUPS = 10;
/** 匿名播放就用匿名读到的单曲详情挑提示、判断有没有试听文件；读不到就当没有详情。 */
const anonymousSongDetail = async (songmid) => {
    try {
        const res = await UCommon({
            method: 'get',
            params: {
                format: 'json',
                data: JSON.stringify({
                    comm: { ct: 24, cv: 0 },
                    req_0: {
                        module: 'music.pf_song_detail_svr',
                        method: 'get_song_detail_yqq',
                        param: { song_type: 0, song_mid: songmid },
                    },
                }),
            },
            option: {},
        });
        const body = res.data;
        return body?.code === 0 && body.req_0?.code === 0 ? body.req_0.data?.track_info : undefined;
    }
    catch {
        return undefined;
    }
};
const loginRequired = { status: 401, headers: {}, body: { code: 401, message: 'Login required' } };
// Node 的配置由薄转接提供，避免把文件系统配置带进 serverless。匿名分支仍使用旧的 CgiGetVkey；
// serverless 缺会话时仍回 401，缺密钥的 501 继续由入口处理。
const createGetMusicPlay = (anonymousDefaults = () => ({ uin: '0', guid: '1429839143' })) => async (request) => {
    const songmid = String(request.params.songmid ?? request.queryRaw('songmid') ?? '').trim();
    if (!songmid)
        return { status: 400, headers: {}, body: { data: { message: 'no songmid' } } };
    const quality = request.queryRaw('quality') ?? '128';
    const mediaId = request.queryRaw('mediaId');
    // 只认明确的 1／true；其他写法（含重复参数）都当成一般请求，回应和以前一样。
    const preview = ['1', 'true'].includes(String(request.queryRaw('preview') ?? ''));
    const token = request.token;
    if (token) {
        const service = await request.service();
        const playUrl = preview
            ? await service.getMusicPlay(token, songmid, quality, mediaId, {
                preview: true,
            })
            : await service.getMusicPlay(token, songmid, quality, mediaId);
        return playUrl ? { status: 200, headers: {}, body: { data: { playUrl } } } : loginRequired;
    }
    if (request.runtime === 'serverless')
        return loginRequired;
    const { uin, guid } = anonymousDefaults();
    const justPlayUrl = (request.queryRaw('resType') || 'play') === 'play';
    const requestedList = songmid.split(',');
    // 试听只要确认有试听文件的歌（每首查一次详情，最多 MAX_HINT_LOOKUPS 首）；其他的直接回「试听不可用」。
    const previewMediaIds = new Map();
    if (preview) {
        const callerMediaId = validMediaIdOf(mediaId);
        const looked = [...new Set(requestedList)].slice(0, MAX_HINT_LOOKUPS);
        const details = await Promise.all(looked.map((mid) => anonymousSongDetail(mid)));
        looked.forEach((mid, index) => {
            const media = previewMediaIdOf(details[index], callerMediaId);
            if (media)
                previewMediaIds.set(mid, media);
        });
    }
    let songmidList = preview
        ? requestedList.filter((mid) => previewMediaIds.has(mid))
        : requestedList;
    const skipped = Object.fromEntries(requestedList
        .filter((mid) => preview && !previewMediaIds.has(mid))
        .map((mid) => [
        mid,
        { url: '', error: '暂无播放链接', restriction: previewUnavailableRestriction(false) },
    ]));
    if (!preview && quality === 'ape') {
        const looked = [...new Set(requestedList)].slice(0, MAX_HINT_LOOKUPS);
        const details = new Map(await Promise.all(looked.map(async (mid) => [mid, await anonymousSongDetail(mid)])));
        songmidList = requestedList.filter((mid) => {
            const reason = apeFileFailureOf(details.get(mid));
            if (!reason)
                return true;
            skipped[mid] = {
                url: '',
                error: '暂无播放链接',
                restriction: qualityFileRestriction(false, reason),
            };
            return false;
        });
    }
    // 文件守门全部挡下时不打取链接请求，回应只有 playUrl。
    if ((preview || quality === 'ape') && !songmidList.length)
        return { status: 200, headers: {}, body: { data: { playUrl: skipped } } };
    const fileInfo = fileType[quality] ?? fileType[128];
    const file = songmidList.map((mid) => preview
        ? previewFilenameOf(previewMediaIds.get(mid))
        : `${fileInfo.s}${mid}${mediaId || mid}${fileInfo.e}`);
    const data = {
        req_0: {
            module: 'vkey.GetVkeyServer',
            method: 'CgiGetVkey',
            param: {
                filename: file,
                guid,
                songmid: songmidList,
                songtype: [0],
                uin,
                loginflag: 1,
                platform: '20',
            },
        },
        loginUin: uin,
        comm: { uin, format: 'json', ct: 24, cv: 0 },
    };
    const res = await UCommon({
        method: 'get',
        params: {
            format: 'json',
            sign: 'zzannc1o6o9b4i971602f3554385022046ab796512b7012',
            data: JSON.stringify(data),
        },
        option: {},
    });
    const response = res.data;
    // 只对 undefined 使用旧默认值；null、错误类型仍按原路由抛错交给宿主兜底。
    const sip = response?.req_0?.data?.sip;
    const domain = (sip === undefined ? [] : sip).find((value) => !value.startsWith('http://ws')) ||
        sip?.[0];
    const midurlinfo = response?.req_0?.data?.midurlinfo;
    const playUrl = {};
    const loggedQuality = preview
        ? 'preview'
        : fileInfo === fileType[128]
            ? '128'
            : String(quality);
    (midurlinfo === undefined ? [] : midurlinfo).forEach((item, index) => {
        if (skipped[item.songmid])
            return;
        if (item.purl) {
            playUrl[item.songmid] = {
                url: `${domain}${item.purl}`,
                error: false,
                ...(preview ? { preview: true } : {}),
            };
            return;
        }
        // 开发日志（debug）：没链接的那首只记位置、音质和白名单里的数字，不记歌曲 id。
        logger.debug('playback.url-unavailable', playbackUnavailableLogOf({
            phase: 'get-music-play-anonymous',
            index,
            quality: loggedQuality,
            entry: item,
        }));
        playUrl[item.songmid] = {
            url: '',
            error: '暂无播放链接',
            restriction: classifyPlaybackRestriction({
                quality: playbackQualityOf(loggedQuality),
                authenticated: false,
                codes: playbackEntryCodesOf(item),
            }),
        };
    });
    const unavailable = Object.entries(playUrl).filter(([, entry]) => entry.restriction);
    // 试听拿不到链接一律是「试听不可用」；其他的在还没有验证过的规则时挑不出具体原因，不用多查。
    unavailable.forEach(([, entry]) => {
        if (entry.restriction)
            entry.restriction.hint = preview ? previewUnavailableHint() : playbackHintOf(undefined);
    });
    Object.assign(playUrl, skipped);
    // 匿名拿不到 320 以上，quality=best 直接要 128（上面已退回 128 的文件名），条目照样标出实际音质。
    if (!preview && quality === 'best')
        for (const entry of Object.values(playUrl))
            entry.quality = '128';
    response.playUrl = playUrl;
    return { status: 200, headers: {}, body: { data: justPlayUrl ? { playUrl } : response } };
};
const getMusicPlay = createGetMusicPlay();

// src/routes/operations/getOwnedPlaylistSongs.ts
// 登录态歌单详情。宽松的 parseInt、零值回默认以及集合回包都照旧。
const getOwnedPlaylistSongs = async (request) => {
    const idOf = (raw) => /^\d+$/.test(String(raw ?? '')) ? Number(raw) : 0;
    const disstid = idOf(request.queryRaw('tid'));
    const dirid = idOf(request.queryRaw('dirid'));
    if (!disstid && !dirid)
        return { status: 400, headers: {}, body: { code: 400, message: 'tid or dirid is required' } };
    const offset = Math.max(0, Number.parseInt(String(request.queryRaw('offset') ?? '0'), 10) || 0);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(request.queryRaw('limit') ?? '100'), 10) || 100));
    const data = await (await request.service()).getOwnedPlaylistSongs(request.token, {
        disstid,
        dirid,
        offset,
        limit,
    });
    if (!data)
        return { status: 401, headers: {}, body: { code: 401, message: 'Login required' } };
    const songs = Array.isArray(data.songlist) ? data.songlist : [];
    const total = typeof data.total_song_num === 'number' ? data.total_song_num : songs.length;
    return {
        status: 200,
        headers: {},
        body: {
            code: 200,
            songs,
            total,
            more: data.hasmore === true || Number(data.hasmore) === 1 || offset + songs.length < total,
        },
    };
};

// src/routes/operations/getSingerAlbum.ts
// 歌手专辑。缺参数的两种回包与重复查询的数值转换照旧，业务码不改 HTTP 状态。
const getSingerAlbum = async ({ runtime, queryRaw }) => {
    const singermid = queryRaw('singermid');
    if (!singermid) {
        return {
            status: 400,
            headers: {},
            body: runtime === 'node' ? { response: 'no singermid' } : { data: { message: 'no singermid' } },
        };
    }
    const num = Number(queryRaw('limit') || 5);
    const begin = Number(queryRaw('page') || 0);
    const response = await u_common({
        method: 'get',
        options: {
            params: {
                format: 'json',
                singermid,
                data: JSON.stringify({
                    comm: { ct: 24, cv: 0 },
                    singer: {
                        method: 'GetAlbumList',
                        param: { sort: 5, singermid, begin, num },
                        module: 'music.musichallAlbum.AlbumListServer',
                    },
                }),
            },
        },
    });
    return { status: 200, headers: {}, body: { response: response.data } };
};

// src/routes/operations/getSingerHotsong.ts
// 歌手热门歌曲。默认 page 为 0，旧偏移量因此为负数；搬迁保留它，不在这里改分页规则。
const getSingerHotsong = async ({ runtime, queryRaw }) => {
    const singermid = queryRaw('singermid');
    if (!singermid) {
        return {
            status: 400,
            headers: {},
            body: runtime === 'node' ? { response: 'no singermid' } : { data: { message: 'no singermid' } },
        };
    }
    const num = Number(queryRaw('limit') || 5);
    const page = Number(queryRaw('page') || 0);
    const response = await u_common({
        method: 'get',
        options: {
            params: {
                format: 'json',
                singermid,
                data: JSON.stringify({
                    comm: { ct: 24, cv: 0 },
                    singer: {
                        method: 'get_singer_detail_info',
                        param: { sort: 5, singermid, sin: (page - 1) * num, num },
                        module: 'music.web_singer_info_svr',
                    },
                }),
            },
        },
    });
    return { status: 200, headers: {}, body: { response: response.data } };
};

// src/routes/operations/getSongInfo.ts
// 单曲详情原样转交。路径优先，重复查询保留 Node 的数组和 serverless 的第一项。
const getSongInfo = async ({ runtime, params, queryRaw }) => {
    const song_mid = params.songmid ?? queryRaw('songmid');
    const song_id = params.songid ?? queryRaw('songid') ?? '';
    const queryParams = {
        ...(runtime === 'node'
            ? {
                ...getLegacyHttpTransport().defaults.commonParams,
                inCharset: 'utf8',
                outCharset: 'utf-8',
                notice: 0,
                platform: 'yqq.json',
                needNewCode: 0,
            }
            : {}),
        format: 'json',
        data: JSON.stringify({
            comm: { ct: 24, cv: 0 },
            songinfo: {
                method: 'get_song_detail_yqq',
                param: { song_type: 0, song_mid, song_id },
                module: 'music.pf_song_detail_svr',
            },
        }),
    };
    const response = await u_common({ method: 'get', options: { params: queryParams } });
    return { status: 200, headers: {}, body: { response: response.data } };
};

const upstream = '/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg';
const credentialUpstream = 'music.srfDissInfo.aiDissInfo/uniform_get_Dissinfo';
/** 匿名 CGI 对 QQ 音乐的算法歌单（百万收藏、歌手漫游……）只回这个码，带凭据才读得到。 */
const ANONYMOUS_UNREADABLE_CODE = 10;
/**
 * 重读成功就返回改写后的回应，其余任何情况（没有会话、上游拒绝、读出来是空的）都返回 `null`，
 * 让调用方保留匿名 CGI 的原始回应。这里绝不抛错，也绝不变成 401：这是一条读歌单的路由，
 * 客户端收到 401 会清掉整个登录态。
 */
const readAlgorithmicPlaylist = async (disstid, readWithCredential) => {
    try {
        const adapted = toSongListDetailResponse(await readWithCredential(disstid));
        if (adapted) {
            logServiceSuccess('songListDetail', credentialUpstream, adapted, {
                disstid,
                source: 'credential-fallback',
            });
        }
        return adapted;
    }
    catch (error) {
        const upstreamCode = numberOf(dictionaryOf(error).upstreamCode);
        logger.warn('service.credential_fallback_failed', {
            service: 'songListDetail',
            disstid,
            name: error instanceof Error ? error.name : 'Error',
            ...(upstreamCode === undefined ? {} : { upstreamCode }),
        });
        return null;
    }
};
var songListDetailService = ({ method = 'get', params = {}, option = {}, readWithCredential, }) => {
    const data = Object.assign(params, {
        format: 'json',
        outCharset: 'utf-8',
        type: 1,
        json: 1,
        utf8: 1,
        onlysong: 0,
        new_format: 1,
    });
    const options = Object.assign(option, {
        params: data,
    });
    logServiceRequest('songListDetail', upstream, data);
    return y_common({
        url: upstream,
        method,
        options,
    })
        .then(async (res) => {
        const response = res.data;
        logServiceSuccess('songListDetail', upstream, response, {
            disstid: data.disstid,
        });
        const disstid = identifierOf(data.disstid);
        const unreadable = isDictionary(response) && numberOf(response.code) === ANONYMOUS_UNREADABLE_CODE;
        const fallback = unreadable && disstid && readWithCredential
            ? await readAlgorithmicPlaylist(disstid, readWithCredential)
            : null;
        return {
            status: 200,
            body: {
                response: fallback ?? response,
            },
        };
    })
        .catch((error) => {
        logServiceFailure('songListDetail', upstream, error, data);
        return {
            status: 500,
            body: {
                error: toLegacyErrorBody(error),
            },
        };
    });
};

// 匿名 CGI 先读；只有 code 10 才由 service 重读。重读失败仍保留匿名回应，不能让 Folia 清掉会话。
const getSongListDetail = async (request) => {
    const disstid = request.params.disstid ?? request.queryRaw('disstid');
    const token = request.token;
    const { status, body } = await songListDetailService({
        method: 'get',
        params: { disstid },
        option: {},
        ...(token && (request.runtime === 'node' || request.sessionConfigured)
            ? {
                readWithCredential: async (id) => (await request.service()).getAuthenticatedSongListDetail(token, id),
            }
            : {}),
    });
    return { status, headers: {}, body };
};

// src/routes/operations/getUserAlbums.ts
// 收藏专辑。宽松的 parseInt、零值回默认以及集合回包都照旧。
const getUserAlbums = async (request) => {
    const offset = Math.max(0, Number.parseInt(String(request.queryRaw('offset') ?? '0'), 10) || 0);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(request.queryRaw('limit') ?? '20'), 10) || 20));
    const data = await (await request.service()).getUserAlbums(request.token, offset, limit);
    if (!data)
        return { status: 401, headers: {}, body: { code: 401, message: 'Login required' } };
    const albums = Array.isArray(data.albumlist) ? data.albumlist : [];
    const total = typeof data.totalalbum === 'number' ? data.totalalbum : albums.length;
    return {
        status: 200,
        headers: {},
        body: {
            code: 200,
            albums,
            total,
            more: Number(data.has_more) === 1 || offset + albums.length < total,
        },
    };
};

// src/routes/operations/getUserLikedSongs.ts
// 喜欢歌曲。宽松的 parseInt、零值回默认以及集合回包都照旧。
const getUserLikedSongs = async (request) => {
    const offset = Math.max(0, Number.parseInt(String(request.queryRaw('offset') ?? '0'), 10) || 0);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(request.queryRaw('limit') ?? '100'), 10) || 100));
    const data = await (await request.service()).getUserLikedSongs(request.token, offset, limit);
    if (!data)
        return { status: 401, headers: {}, body: { code: 401, message: 'Login required' } };
    const songs = Array.isArray(data.songlist) ? data.songlist : [];
    const total = typeof data.total_song_num === 'number' ? data.total_song_num : songs.length;
    return {
        status: 200,
        headers: {},
        body: {
            code: 200,
            songs,
            total,
            more: data.hasmore === true || Number(data.hasmore) === 1 || offset + songs.length < total,
        },
    };
};

/**
 * 与其他路由的 offset 一样宽松：不是正整数（缺少、0、负数、乱码）就当作第一轮，返回 `undefined`，
 * 这样不带参数的调用方（包括 Folia）与以前完全相同。
 */
const favoriteOffsetOf = (raw) => {
    const value = Number.parseInt(String(raw ?? ''), 10);
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
};
/** 只有 `playCount=1` 才算开启；重复参数只看第一项。 */
const playCountOf = (raw) => (Array.isArray(raw) ? raw[0] : raw) === '1';
/** 两个参数都没给时回 `undefined`，让不带参数的调用方（包括 Folia）与以前完全相同。 */
const userPlaylistOptionsOf = (raw, rawPlayCount) => {
    const favoriteOffset = favoriteOffsetOf(raw);
    const playCount = playCountOf(rawPlayCount);
    if (favoriteOffset === undefined && !playCount)
        return undefined;
    return {
        ...(favoriteOffset === undefined ? {} : { favoriteOffset }),
        ...(playCount ? { playCount } : {}),
    };
};
/**
 * `more` 表示列表还不能确认完整；只有读到上限、确实可以接着读时才带 `nextFavoriteOffset`。
 * 空页或重复页停下时 `more` 仍是 `true`，但不给续读位置，免得调用方一直重复同一件事。
 */
const toUserPlaylistBody = (data) => {
    const playlist = Array.isArray(data.v_playlist) ? data.v_playlist : [];
    const nextFavoriteOffset = numberOf(data.nextFavoriteOffset);
    return {
        code: 200,
        playlist,
        total: typeof data.total === 'number' ? data.total : playlist.length,
        more: data.bFinish === false,
        ...(nextFavoriteOffset !== undefined && Number.isSafeInteger(nextFavoriteOffset)
            ? { nextFavoriteOffset }
            : {}),
        ...(typeof data.playCountComplete === 'boolean'
            ? { playCountComplete: data.playCountComplete }
            : {}),
    };
};

// src/routes/operations/getUserPlaylist.ts
// 用户歌单。Node 的重复 uid 仍是数组，不把旧的参数行为悄悄改成只取第一项。
const getUserPlaylist = async (request) => {
    const service = await request.service();
    const uid = request.queryRaw('uid');
    const options = userPlaylistOptionsOf(request.queryRaw('favoriteOffset'), request.queryRaw('playCount'));
    // Node 的旧 service 包装在没有续读时只传两个参数；serverless 原来一直传三个。
    const data = request.runtime === 'node' && !options
        ? await service.getUserPlaylists(request.token, uid)
        : await service.getUserPlaylists(request.token, uid, options);
    return {
        status: data ? 200 : 401,
        headers: {},
        body: data ? toUserPlaylistBody(data) : { code: 401, message: 'Login required' },
    };
};

// These flags describe implemented backend methods, independent of login or upstream availability.
// Keep client-only predicates and diagnostics out of this declaration.
const featuresFor = () => ({
    user: { getVip: true },
    playlistManagement: { createPlaylist: true, renamePlaylist: true, deletePlaylist: true },
    auth: {
        getLoginStatus: true,
        logout: true,
        getQrKey: true,
        createQr: true,
        checkQr: true,
        cancelQr: true,
    },
    library: {
        getUserPlaylists: true,
        getUserAlbums: true,
        getLikedSongIds: true,
        getLikedSongs: true,
        getCloudCollection: false,
    },
    catalog: {
        getPlaylistTracks: true,
        getPlaylistDetail: false,
        getAlbumDetail: true,
        getAlbumTracks: true,
        getArtistDetail: true,
        getArtistSongs: true,
        getArtistAlbums: true,
        getCloudTracks: false,
        getSubscriptionStatus: true,
    },
    playback: {
        getSongDetail: true,
        getAudioSource: true,
        getReplacement: false,
        preview: true,
    },
    search: { searchSongs: true, searchAlbums: true, searchPlaylists: true, searchArtists: true },
    lyrics: { getLyrics: true, getChorusRanges: false },
    recommendations: {
        getPersonalFm: true,
        getDailySongs: true,
        getRecommendedCollections: true,
        getHistoryEntries: false,
        getHistoryDates: false,
        getHistorySongs: false,
        dislikeSong: false,
        personalFmModes: true,
        getPlaylistCategories: true,
        getCategoryPlaylists: true,
        getNewSongs: true,
    },
    radio: { getRadioList: true, getRadioTracks: true },
    mutations: {
        updatePlaylistTracks: true,
        likeSong: true,
        subscribePlaylist: true,
        subscribeAlbum: true,
    },
    playbackReports: { reportPlayback: false },
});
/** Shared wire shape; existing channel order, session mode and configuration meaning stay intact. */
const describeRuntimeCapabilities = (
// 两个运行时现在声明同一组方法；参数保留，以后哪个方法只在一边实现时再按它区分。
_runtime, capabilities, configured) => ({
    channels: [...capabilities.channels],
    sessionMode: capabilities.sessionMode,
    configured,
    features: featuresFor(),
});

const loginChannels = async (request) => {
    const node = request.runtime === 'node';
    const capabilities = node
        ? NODE_RUNTIME_CAPABILITIES
        : (request.capabilities ?? { channels: ['wechat'], sessionMode: 'sealed' });
    return {
        status: 200,
        headers: {},
        body: {
            code: 200,
            data: describeRuntimeCapabilities(request.runtime, capabilities, node || Boolean(request.sessionConfigured)),
        },
    };
};

// src/routes/operations/loginStatus.ts
// 登录状态始终回 200；有没有 profile 由服务判断，其他异常仍交给宿主兜底。
const loginStatus = async (request) => {
    const profile = await (await request.service()).getLoginStatus(request.token);
    return { status: 200, headers: {}, body: { code: 200, data: profile ? { profile } : {} } };
};

// src/serverless/response.ts
//
// serverless 路由共用的两件事：把内容写成 JSON 回应，以及路由抛出异常时怎么回。
// 单独放一个文件，是为了让入口以外的路由实现（还有测试）也用同一份，不各写一套。
const AUTH_COOKIE_NAME = 'qqmusic_session';
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
});
/**
 * 和 Koa 那边的错误中间件同一个分法：上游明确拒绝凭证、请求本身不被接受，回对应的状态码，
 * 客户端可以自己处理；其余一律 500，内容只来自固定模板。
 */
const failureResponse = (error) => {
    if (error instanceof AuthCredentialRejectedError || error instanceof RequestRejectedError)
        return json({ code: error.httpStatus, message: error.message }, error.httpStatus);
    return json({ error: toLegacyErrorMessage(error) }, error instanceof GatewayCredentialConflictError ? error.responseStatus : 500);
};

// src/routes/operations/logout.ts
// 会话退出共用服务；Node 的 Cookie 留给 Koa 转接，sealed 客户端仍靠清除 Cookie 结束会话。
const logout = async (request) => {
    await (await request.service()).logout(request.token);
    const headers = request.runtime === 'serverless'
        ? { 'set-cookie': `${AUTH_COOKIE_NAME}=; Max-Age=0; Path=/` }
        : {};
    return {
        status: 200,
        headers,
        body: { code: 200 },
    };
};

const ownedPlaylistsDescriptor = (session) => ({
    module: 'music.musicasset.PlaylistBaseRead',
    method: 'GetPlaylistByUin',
    param: { uin: credentialMusicId(session.credential) },
    readOnly: true,
    operation: 'playlist.owned-list',
    decode: (data) => {
        if (!isDictionary(data) || !Array.isArray(data.v_playlist))
            throw new QqApiError('invalid-response');
        return data.v_playlist;
    },
});
/** 只在本人自建清单的唯一对应中选择已知普通目录；不接受收藏条目的目录号。 */
const ordinaryOwnedPlaylistOf = (list, tid, session) => {
    const matches = list.filter((item) => isDictionary(item) && positiveIntegerOf(item.tid) === tid);
    if (matches.length !== 1 || !isDictionary(matches[0]))
        throw new QqApiError('input');
    const entry = matches[0];
    const dirId = positiveIntegerOf(entry.dirId);
    const ownIds = [
        credentialMusicId(session.credential),
        String(session.credential.musicid),
        String(session.credential.str_musicid),
    ];
    if (!dirId ||
        dirId >= 200 ||
        (entry.dirType !== undefined && entry.dirType !== 0) ||
        (entry.uin !== undefined && !ownIds.includes(String(entry.uin))))
        throw new QqApiError('input');
    return { entry, dirId };
};

const playlistWriteResultOf = (data) => {
    if (!isDictionary(data) || data.retCode !== 0 || !isDictionary(data.result))
        throw new QqApiError('invalid-response');
    return data.result;
};
const failedPlaylistWrite = (phase, error, writeAttempted, known) => {
    const result = failureResult(phase, error);
    return {
        ...result,
        body: {
            ...result.body,
            retryable: false,
            ...(writeAttempted ? { writeAttempted: true, verification: 'unconfirmed', ...known } : {}),
        },
    };
};
const playlistCreateResult = async (session, raw, options = {}) => {
    let writeAttempted = false;
    const known = {};
    try {
        if (!session)
            throw new QqApiError('auth-missing');
        const input = exactObjectOf(raw, ['name']);
        const name = input.name;
        if (typeof name !== 'string' ||
            !name.trim() ||
            [...name].length > 20 ||
            [...name].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
            throw new QqApiError('input');
        const client = createSessionMusicuClient(session, options);
        writeAttempted = true;
        const data = await client.execute({
            module: 'music.musicasset.PlaylistBaseWrite',
            method: 'AddPlaylist',
            param: { dirName: name },
            readOnly: false,
            operation: 'playlist.create',
        });
        const result = playlistWriteResultOf(data);
        const tid = positiveIntegerOf(result.tid), dirId = positiveIntegerOf(result.dirId);
        if (!tid || !dirId || dirId >= 200)
            throw new QqApiError('invalid-response');
        Object.assign(known, { tid, dirId });
        const list = await client.execute(ownedPlaylistsDescriptor(session));
        let read;
        try {
            read = ordinaryOwnedPlaylistOf(list, tid, session);
        }
        catch {
            throw new QqApiError('invalid-response');
        }
        if (read.dirId !== dirId || typeof read.entry.dirName !== 'string')
            throw new QqApiError('invalid-response');
        const moderation = Object.fromEntries(['bSafetyHitName', 'bSafetyHitDesc'].flatMap((key) => typeof result[key] === 'boolean' ? [[key, result[key]]] : []));
        if (isDictionary(data))
            for (const key of ['hit_type', 'hit_reason'])
                if (typeof data[key] === 'number' && Number.isSafeInteger(data[key]))
                    moderation[key] = data[key];
        return okResult({
            tid,
            dirId,
            name: read.entry.dirName,
            verified: true,
            ...(Object.keys(moderation).length ? { moderation } : {}),
        });
    }
    catch (error) {
        return failedPlaylistWrite('playlist-create', error, writeAttempted, known);
    }
};
const playlistDeleteResult = async (session, raw, options = {}) => {
    let writeAttempted = false;
    const known = {};
    try {
        if (!session)
            throw new QqApiError('auth-missing');
        const input = exactObjectOf(raw, ['tid']);
        const tid = positiveIntegerOf(input.tid);
        if (!tid)
            throw new QqApiError('input');
        const client = createSessionMusicuClient(session, options);
        const { dirId } = ordinaryOwnedPlaylistOf(await client.execute(ownedPlaylistsDescriptor(session)), tid, session);
        Object.assign(known, { tid, dirId });
        writeAttempted = true;
        const result = playlistWriteResultOf(await client.execute({
            module: 'music.musicasset.PlaylistBaseWrite',
            method: 'DelPlaylist',
            param: { dirId },
            readOnly: false,
            operation: 'playlist.delete',
        }));
        if (positiveIntegerOf(result.dirId) !== dirId ||
            positiveIntegerOf(result.tid) !== tid ||
            result.updateTime !== 0)
            throw new QqApiError('invalid-response');
        const read = await client.execute(ownedPlaylistsDescriptor(session));
        if (read.some((item) => isDictionary(item) &&
            (positiveIntegerOf(item.tid) === tid || positiveIntegerOf(item.dirId) === dirId)))
            throw new QqApiError('invalid-response');
        return okResult({ tid, deleted: true, verified: true });
    }
    catch (error) {
        return failedPlaylistWrite('playlist-delete', error, writeAttempted, known);
    }
};

const editValuesOf = (data, dirId) => {
    if (!isDictionary(data) || !isDictionary(data.dirinfo))
        throw new QqApiError('invalid-response');
    const value = data.dirinfo;
    if (value.dirid !== dirId ||
        typeof value.title !== 'string' ||
        typeof value.desc !== 'string' ||
        typeof value.picurl !== 'string' ||
        value.picurl2 !== '' ||
        (value.dir_show !== 1 && value.dir_show !== 2) ||
        !Array.isArray(value.tag) ||
        value.tag.length > 3)
        throw new QqApiError('invalid-response');
    // 非空第二封面尚无写后保留实测，不能用静态映射保证此设置不变。
    const tag = value.tag.map((item) => {
        if (!isDictionary(item) ||
            typeof item.id !== 'number' ||
            !positiveIntegerOf(item.id) ||
            typeof item.name !== 'string')
            throw new QqApiError('invalid-response');
        return { id: item.id, name: item.name };
    });
    return {
        title: value.title,
        desc: value.desc,
        picurl: value.picurl,
        picurl2: '',
        tag,
        dir_show: value.dir_show,
    };
};
const editReadDescriptor = (dirId) => ({
    module: 'music.srfDissInfo.aiDissInfo',
    method: 'uniform_get_Dissinfo',
    param: { dirid: dirId, optype: 3, tag: 1, userinfo: 0, pic_dpi: 300 },
    readOnly: true,
    operation: 'playlist.edit-read',
});
const playlistRenameResult = async (session, raw, options = {}) => {
    let writeAttempted = false;
    const known = {};
    try {
        if (!session)
            throw new QqApiError('auth-missing');
        const input = exactObjectOf(raw, ['tid', 'name']);
        const tid = positiveIntegerOf(input.tid), name = input.name;
        if (!tid ||
            typeof name !== 'string' ||
            !name.trim() ||
            [...name].length > 20 ||
            [...name].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
            throw new QqApiError('input');
        const client = createSessionMusicuClient(session, options);
        const { dirId } = ordinaryOwnedPlaylistOf(await client.execute(ownedPlaylistsDescriptor(session)), tid, session);
        Object.assign(known, { tid, dirId });
        const descriptor = editReadDescriptor(dirId);
        const before = editValuesOf(await client.execute(descriptor), dirId);
        writeAttempted = true;
        const result = playlistWriteResultOf(await client.execute({
            module: 'music.musicasset.PlaylistBaseWrite',
            method: 'EditPlaylist',
            param: {
                dirId,
                mask: 95,
                dirNewName: name,
                dirNewDesc: before.desc,
                dirNewPicUrl: before.picurl,
                dirNewPicUrl2: before.picurl2,
                dirNewtaglist: before.tag.map((item) => item.id).join(','),
                dirShow: before.dir_show,
            },
            readOnly: false,
            operation: 'playlist.rename',
        }));
        if (positiveIntegerOf(result.dirId) !== dirId || positiveIntegerOf(result.tid) !== tid)
            throw new QqApiError('invalid-response');
        const after = editValuesOf(await client.execute(descriptor), dirId);
        if (after.title !== name ||
            after.desc !== before.desc ||
            after.picurl !== before.picurl ||
            after.picurl2 !== before.picurl2 ||
            after.dir_show !== before.dir_show ||
            JSON.stringify(after.tag) !== JSON.stringify(before.tag))
            throw new QqApiError('invalid-response');
        return okResult({ tid, name: after.title, verified: true });
    }
    catch (error) {
        return failedPlaylistWrite('playlist-rename', error, writeAttempted, known);
    }
};

const writeHandler = (action) => async (request) => {
    if (request.method !== 'POST')
        return {
            status: 405,
            headers: { Allow: 'POST' },
            body: { code: 405, message: 'POST required' },
        };
    const session = await (await request.service()).resolveSession(request.token);
    if (!session)
        return toNewRouteErrorResponse(new QqApiError('auth-missing'));
    let body;
    try {
        body = await request.body?.();
    }
    catch {
        return toNewRouteErrorResponse(new QqApiError('input'));
    }
    return action(session, body);
};
const playlistCreate = writeHandler(playlistCreateResult);
const playlistDelete = writeHandler(playlistDeleteResult);
const playlistRename = writeHandler(playlistRenameResult);

const ownedList = (session) => ({
    module: 'music.musicasset.PlaylistBaseRead',
    method: 'GetPlaylistByUin',
    param: { uin: credentialMusicId(session.credential) },
    readOnly: true,
    operation: 'playlist.owned-list',
    decode: (data) => {
        if (!isDictionary(data) || !Array.isArray(data.v_playlist))
            throw new QqApiError('invalid-response');
        return data.v_playlist;
    },
});
/** 只读一页，不把未读到的歌曲猜成不存在，也不让核对失败覆盖已经收到的写入结果。 */
const verifyTrackPresence = async (session, tid, dirId, ids, options) => {
    const encryptedUin = session.credential.encryptUin;
    if (typeof encryptedUin !== 'string' || !encryptedUin)
        return 'unknown';
    try {
        const data = await createSessionMusicuClient(session, { ...options, maxRetries: 0 }).execute({
            module: 'music.srfDissInfo.DissInfo',
            method: 'CgiGetDiss',
            param: {
                disstid: tid,
                dirid: dirId,
                tag: true,
                song_begin: 0,
                song_num: 100,
                userinfo: true,
                orderlist: true,
                enc_host_uin: encryptedUin,
            },
            readOnly: true,
            operation: 'playlist.track-verification',
        });
        if (!isDictionary(data) ||
            !Array.isArray(data.songlist) ||
            (data.code !== undefined && data.code !== 0) ||
            (data.subcode !== undefined && data.subcode !== 0))
            return 'unknown';
        const found = new Set();
        let valid = true;
        for (const song of data.songlist) {
            if (!isDictionary(song)) {
                valid = false;
                continue;
            }
            const id = positiveIntegerOf(song.id ?? song.songid);
            if (id === undefined ||
                (song.id != null && song.songid != null && positiveIntegerOf(song.songid) !== id)) {
                valid = false;
                continue;
            }
            found.add(id);
        }
        if (ids.every((id) => found.has(id)))
            return 'present';
        const complete = valid &&
            found.size === data.songlist.length &&
            Number.isSafeInteger(data.total_song_num) &&
            data.total_song_num === data.songlist.length &&
            (data.hasmore === 0 || data.hasmore === false);
        return complete && ids.every((id) => !found.has(id)) ? 'absent' : 'unknown';
    }
    catch {
        return 'unknown';
    }
};
const playlistTracksResult = async (session, raw, options = {}) => {
    try {
        if (!session)
            throw new QqApiError('auth-missing');
        const input = exactObjectOf(raw, ['tid', 'op', 'songs']);
        const tid = positiveIntegerOf(input.tid);
        if (!tid ||
            typeof input.op !== 'string' ||
            !['add', 'del'].includes(input.op) ||
            !Array.isArray(input.songs) ||
            input.songs.length < 1 ||
            input.songs.length > 100)
            throw new QqApiError('input');
        const songs = input.songs.map(playlistSongOf);
        const client = createSessionMusicuClient(session, options);
        const created = await client.execute(ownedList(session));
        const matched = created.filter((item) => isDictionary(item) && positiveIntegerOf(item.tid) === tid);
        if (matched.length !== 1 || !isDictionary(matched[0]))
            throw new QqApiError('input');
        const playlist = matched[0];
        const dirId = positiveIntegerOf(playlist.dirId);
        // 3.3.0 只接受自建清单中已知普通目录。系统目录或未知目录不尝试写入。
        if (!dirId || dirId >= 200 || (playlist.dirType !== undefined && playlist.dirType !== 0))
            throw new QqApiError('input');
        const add = input.op === 'add';
        const data = await client.execute({
            module: 'music.musicasset.PlaylistDetailWrite',
            method: add ? 'AddSonglist' : 'DelSonglist',
            param: { dirId, v_songInfo: songs },
            readOnly: false,
            operation: add ? 'playlist.add-songs' : 'playlist.del-songs',
            decode: (value) => {
                if (!isDictionary(value) || value.retCode !== 0 || !isDictionary(value.result))
                    throw new QqApiError('invalid-response');
                return value.result;
            },
        });
        const changed = data.dirId === dirId && positiveIntegerOf(data.tid) === tid;
        if (!changed && !(data.dirId === 0 && (data.tid === 0 || data.tid === '0')))
            throw new QqApiError('invalid-response');
        // 回应里的逐首 existed 实测不能说明歌曲原本在不在，所以不回传，整体变更只看 changed。
        return okResult({
            changed,
            ...(!changed
                ? {
                    verification: {
                        status: await verifyTrackPresence(session, tid, dirId, songs.map((song) => song.songId), options),
                    },
                }
                : {}),
        });
    }
    catch (error) {
        return failureResult('playlist-track-write', error);
    }
};

const playlistTracks = async (request) => {
    if (request.method !== 'POST')
        return {
            status: 405,
            headers: { Allow: 'POST' },
            body: { code: 405, message: 'POST required' },
        };
    const session = await (await request.service()).resolveSession(request.token);
    if (!session)
        return toNewRouteErrorResponse(new QqApiError('auth-missing'));
    try {
        return playlistTracksResult(session, await request.body?.());
    }
    catch {
        return toNewRouteErrorResponse(new QqApiError('input'));
    }
};

const qrCancel = async (request) => {
    const key = request.queryRaw('key');
    if (!key)
        return { status: 400, headers: {}, body: { code: 400, message: 'key is required' } };
    if (request.qr?.cancelSession)
        await request.qr.cancelSession(String(key));
    else
        (await request.service()).cancelSession(String(key));
    // 未知、过期或重复取消都继续回成功。
    return { status: 200, headers: {}, body: { code: 200 } };
};

const qrCookieTokenOf = (cookie) => {
    for (const entry of cookie.split(';')) {
        const separator = entry.indexOf('=');
        if (separator <= 0)
            continue;
        if (entry.slice(0, separator).trim() === 'qqmusic_session')
            return entry.slice(separator + 1).trim() || undefined;
    }
    return undefined;
};
const qrCheck = async (request) => {
    const key = request.queryRaw('key');
    if (!key)
        return { status: 400, headers: {}, body: { code: 400, message: 'key is required' } };
    const result = request.qr?.checkQr
        ? await request.qr.checkQr(String(key))
        : await (await request.service()).checkQr(String(key));
    const token = result.code === 803 && result.cookie ? qrCookieTokenOf(result.cookie) : undefined;
    // Node 用 Koa Cookie API；serverless 继续发送原来的 Max-Age 标头。
    const headers = request.runtime === 'serverless' && token
        ? { 'set-cookie': `qqmusic_session=${token}; HttpOnly; Max-Age=86400; SameSite=Lax; Path=/` }
        : {};
    return { status: 200, headers, body: result };
};

// 只处理原控制器捕获的服务错误；其他异常仍交给宿主的安全兜底。
const qrServiceErrorResult = (error) => {
    if (!(error instanceof QrLoginServiceError))
        throw error;
    return {
        status: error.httpStatus,
        headers: error.retryAfterMs
            ? { 'retry-after': String(Math.ceil(error.retryAfterMs / 1000)) }
            : {},
        body: {
            code: error.httpStatus,
            message: error.message,
            retryAfterMs: error.retryAfterMs,
            ...(error.upstreamCode === undefined ? {} : { upstreamCode: error.upstreamCode }),
            ...error.diagnostics,
        },
    };
};

const qrCreate = async (request) => {
    const key = request.queryRaw('key');
    if (!key)
        return { status: 400, headers: {}, body: { code: 400, message: 'key is required' } };
    try {
        const qrimg = request.qr?.createQr
            ? await request.qr.createQr(String(key))
            : await (await request.service()).createQr(String(key));
        return { status: 200, headers: {}, body: { code: 200, data: { qrimg } } };
    }
    catch (error) {
        return qrServiceErrorResult(error);
    }
};

const qrKey = async (request) => {
    const raw = request.queryRaw('channel') ?? (request.runtime === 'node' ? DEFAULT_LOGIN_CHANNEL : 'wechat');
    const channel = request.runtime === 'node' ? normalizeLoginChannel(raw) : raw;
    if (request.runtime === 'node' && !channel)
        return {
            status: 400,
            headers: {},
            body: { code: 400, message: `channel must be one of ${SUPPORTED_LOGIN_CHANNELS.join(', ')}` },
        };
    try {
        const unikey = request.qr?.createSession
            ? await request.qr.createSession(channel)
            : await (await request.service()).createSession(channel);
        return { status: 200, headers: {}, body: { code: 200, data: { unikey } } };
    }
    catch (error) {
        return qrServiceErrorResult(error);
    }
};

const songLikeResult = async (session, raw, options = {}) => {
    try {
        if (!session)
            throw new QqApiError('auth-missing');
        const input = exactObjectOf(raw, ['song', 'liked']);
        const song = exactObjectOf(input.song, ['id', 'mid', 'type']);
        if (typeof song.id !== 'number' ||
            positiveIntegerOf(song.id) === undefined ||
            typeof song.mid !== 'string' ||
            !/^[A-Za-z0-9]{1,64}$/.test(song.mid) ||
            song.type !== 0 ||
            typeof input.liked !== 'boolean')
            throw new QqApiError('input');
        const id = song.id, mid = song.mid, liked = input.liked;
        const client = createSessionMusicuClient(session, { ...options, maxRetries: 0 });
        // 用已存在的详情协议核对关系；关联读不到时不猜、不执行写入。
        const track = await client.execute({
            module: 'music.pf_song_detail_svr',
            method: 'get_song_detail_yqq',
            param: { song_type: 0, song_mid: mid },
            readOnly: true,
            operation: 'song.identity-check',
            decode: (data) => {
                if (!isDictionary(data) || !isDictionary(data.track_info))
                    throw new QqApiError('invalid-response');
                return data.track_info;
            },
        });
        if (positiveIntegerOf(track.id) === undefined || typeof track.mid !== 'string')
            throw new QqApiError('invalid-response');
        // 读取条目的 type/songtype 不是写入 songType 的编码，输入类型已单独验证为 0。
        if (positiveIntegerOf(track.id) !== id || track.mid !== mid)
            throw new QqApiError('input');
        const read = () => client.execute({
            module: 'music.musicasset.SongFavRead',
            method: 'IsSongFanByMid',
            param: { v_songMid: [mid] },
            readOnly: true,
            operation: 'subscription.song-status',
            decode: (data) => {
                if (!isDictionary(data) ||
                    !isDictionary(data.m_fan) ||
                    typeof data.m_fan[mid] !== 'boolean')
                    throw new QqApiError('invalid-response');
                return data.m_fan[mid];
            },
        });
        if ((await read()) === liked)
            return okResult({ liked });
        await client.execute({
            module: 'music.musicasset.PlaylistDetailWrite',
            method: liked ? 'AddSonglist' : 'DelSonglist',
            param: { dirId: 201, v_songInfo: [{ songId: id, songType: 0 }] },
            readOnly: false,
            operation: liked ? 'song.like' : 'song.unlike',
            decode: (data) => {
                if (!isDictionary(data) || data.retCode !== 0 || !isDictionary(data.result))
                    throw new QqApiError('invalid-response');
                const result = data.result;
                if (!(result.dirId === 201 && positiveIntegerOf(result.tid) !== undefined) &&
                    !(result.dirId === 0 && (result.tid === 0 || result.tid === '0')))
                    throw new QqApiError('invalid-response');
                return undefined;
            },
        });
        if ((await read()) !== liked)
            throw new QqApiError('invalid-response');
        return okResult({ liked });
    }
    catch (error) {
        const safe = error instanceof QqApiError
            ? error.kind === 'rate-limited'
                ? new QqApiError('upstream-business', {
                    ...error.toJSON(),
                    errorKey: 'upstream.unknown',
                    retryable: false,
                })
                : error
            : new QqApiError('invalid-response');
        const result = failureResult('song-like', safe);
        return { ...result, body: { ...result.body, retryable: false } };
    }
};

const songLike = async (request) => {
    if (request.method !== 'POST')
        return {
            status: 405,
            headers: { Allow: 'POST' },
            body: { code: 405, message: 'POST required' },
        };
    const session = await (await request.service()).resolveSession(request.token);
    if (!session)
        return toNewRouteErrorResponse(new QqApiError('auth-missing'));
    try {
        return songLikeResult(session, await request.body?.());
    }
    catch {
        return toNewRouteErrorResponse(new QqApiError('input'));
    }
};

const playlistSubscribeResult = async (session, raw, options = {}) => {
    try {
        if (!session)
            throw new QqApiError('auth-missing');
        const input = exactObjectOf(raw, ['tid', 'subscribed']);
        const tid = positiveIntegerOf(input.tid);
        if (!tid || typeof input.subscribed !== 'boolean')
            throw new QqApiError('input');
        await createSessionMusicuClient(session, options).execute({
            module: 'music.musicasset.PlaylistFavWrite',
            method: input.subscribed ? 'FavPlaylist' : 'CancelFavPlaylist',
            param: { uin: credentialMusicId(session.credential), v_playlistId: [tid] },
            readOnly: false,
            operation: input.subscribed ? 'playlist.subscribe' : 'playlist.unsubscribe',
            decode: (data) => {
                if (!isDictionary(data) ||
                    !Array.isArray(data.v_failedPlaylistId) ||
                    typeof data.result !== 'number')
                    throw new QqApiError('invalid-response');
                if (data.result !== 0 || data.v_failedPlaylistId.length)
                    throw new QqApiError('upstream-business');
                return undefined;
            },
        });
        return okResult({ subscribed: input.subscribed });
    }
    catch (error) {
        return failureResult('playlist-subscribe', error);
    }
};
/** 三类各自有 Android 多 id 的实测；新增类型需自己的协议及验证，不能通用替换参数名。 */
const STATUS_PROTOCOLS = {
    playlist: {
        module: 'music.musicasset.PlaylistFavRead',
        method: 'IsPlaylistFan',
        operation: 'subscription.playlist-status',
        param: (ids) => ({ v_tid: ids.map(Number) }),
    },
    album: {
        module: 'music.musicasset.AlbumFavRead',
        method: 'IsAlbumFan',
        operation: 'subscription.album-status',
        param: (ids, session) => {
            return { uin: albumOwnerOf(session.credential).statusUin, v_albumMid: ids };
        },
    },
    song: {
        module: 'music.musicasset.SongFavRead',
        method: 'IsSongFanByMid',
        operation: 'subscription.song-status',
        param: (ids) => ({ v_songMid: ids }),
    },
};
const subscriptionStatusResult = async (session, type, rawIds, options = {}) => {
    try {
        if (!session)
            throw new QqApiError('auth-missing');
        const protocol = typeof type === 'string' && Object.hasOwn(STATUS_PROTOCOLS, type)
            ? STATUS_PROTOCOLS[type]
            : undefined;
        if (!protocol || typeof rawIds !== 'string')
            throw new QqApiError('input');
        const requested = rawIds.split(',');
        if (!requested.length ||
            requested.length > 100 ||
            requested.some((id) => type === 'playlist' ? positiveIntegerOf(id) === undefined : !/^[A-Za-z0-9]{1,64}$/.test(id)))
            throw new QqApiError('input');
        const ids = [
            ...new Set(requested.map((id) => (type === 'playlist' ? String(positiveIntegerOf(id)) : id))),
        ];
        const fan = await createSessionMusicuClient(session, options).execute({
            module: protocol.module,
            method: protocol.method,
            operation: protocol.operation,
            param: protocol.param(ids, session),
            readOnly: true,
            decode: (data) => {
                if (!isDictionary(data) || !isDictionary(data.m_fan))
                    throw new QqApiError('invalid-response');
                return data.m_fan;
            },
        });
        return okResult({
            type,
            items: ids.map((id) => ({
                id,
                status: fan[id] === true ? 'subscribed' : fan[id] === false ? 'not-subscribed' : 'unknown',
            })),
        });
    }
    catch (error) {
        return failureResult('subscription-status', error);
    }
};

const playlistSubscribe = async (request) => {
    if (request.method !== 'POST')
        return {
            status: 405,
            headers: { Allow: 'POST' },
            body: { code: 405, message: 'POST required' },
        };
    const session = await (await request.service()).resolveSession(request.token);
    if (!session)
        return toNewRouteErrorResponse(new QqApiError('auth-missing'));
    try {
        return playlistSubscribeResult(session, await request.body?.());
    }
    catch {
        return toNewRouteErrorResponse(new QqApiError('input'));
    }
};
const subscriptionStatus = async (request) => {
    if (request.method !== 'GET')
        return { status: 405, headers: { Allow: 'GET' }, body: { code: 405, message: 'GET required' } };
    return subscriptionStatusResult(await (await request.service()).resolveSession(request.token), request.query('type'), request.query('ids'));
};

const decode$2 = (data) => {
    if (!isDictionary(data))
        throw new QqApiError('invalid-response');
    // 实测成功时内层 code、subcode 都是 0；非 0 的意思没有分离，不当成功也不当凭证失效。
    if (data.code !== undefined && data.code !== 0)
        throw new QqApiError('invalid-response');
    const { songlist } = data;
    if (songlist !== null && songlist !== undefined && !Array.isArray(songlist))
        throw new QqApiError('invalid-response');
    return { songs: Array.isArray(songlist) ? songlist : [] };
};
const DAILY_SONGS = {
    module: 'music.srfDissInfo.aiDissInfo',
    method: 'uniform_get_Dissinfo',
    param: { dirid: 202, optype: 3, tag: 1, userinfo: 0, pic_dpi: 300 },
    readOnly: true,
    operation: 'recommend.daily-songs',
    decode: decode$2,
};
/** 没有会话回 401；上游成功但没有歌回 422。歌曲条目原样交出去，由前端自己正规化。 */
const dailySongsResult = async (session, options = {}) => {
    try {
        if (!session)
            throw new QqApiError('auth-missing');
        const data = await createSessionMusicuClient(session, options).execute(DAILY_SONGS);
        if (!data.songs.length)
            throw new QqApiError('not-found');
        return okResult({ songs: data.songs });
    }
    catch (error) {
        return failureResult('get-daily-songs', error);
    }
};

const userDailySongs = async (request) => dailySongsResult(await (await request.service()).resolveSession(request.token));

// src/routes/operations/userDetail.ts
// 用户资料。服务返回空才回登录要求，其他异常继续交给原来的宿主兜底。
const userDetail = async (request) => {
    const profile = await (await request.service()).getUserDetail(request.token);
    return {
        status: profile ? 200 : 401,
        headers: {},
        body: profile ? { code: 200, profile } : { code: 401, message: 'Login required' },
    };
};

// 已观察的会员与权益旗标按原值保留，不返回账号、未知字段或整份上游数据。
const VIP_FIELDS = [
    'iVipFlag',
    'iSuperVip',
    'iNewSuperVip',
    'iNewVip',
    'HugeVip',
    'AdVipFlag',
    'AdActiveFlag',
    'AdSigned',
    'AdGotVipTs',
    'MainAdsFreeEndTs',
    'OverseaFlag',
    'iYellowVip',
    'iMusicLevel',
    'iCurLevel',
    'UnionFreeEndTs',
    'SongTiyanEndts',
];
const descriptor = (session) => {
    const uin = credentialMusicId(session.credential);
    return {
        module: 'userInfo.VipQueryServer',
        method: 'SRFVipQuery_V2',
        param: { uin_list: [uin] },
        operation: 'user.vip',
        readOnly: true,
        decode: (data) => {
            const info = isDictionary(data) && isDictionary(data.infoMap) ? data.infoMap[uin] : undefined;
            if (!isDictionary(info) ||
                typeof info.iVipFlag !== 'number' ||
                !Number.isSafeInteger(info.iVipFlag))
                throw new QqApiError('invalid-response');
            return Object.fromEntries(VIP_FIELDS.flatMap((key) => {
                const value = info[key];
                return typeof value === 'string' ||
                    typeof value === 'boolean' ||
                    (typeof value === 'number' && Number.isFinite(value))
                    ? [[key, value]]
                    : [];
            }));
        },
    };
};
/**
 * 只有三级：HugeVip 为 1 是超级会员；HugeVip 为 0 时 iVipFlag 为 1 是绿钻、为 0 是免费。
 * iSuperVip 在绿钻账号也是 1，不能拿来认超级会员。缺字段或出现没见过的值都回 unknown，不当成免费。
 */
const vipLevelOf = (flags) => {
    const huge = flags.HugeVip;
    const vip = flags.iVipFlag;
    if (huge === 1)
        return 'super';
    if (huge !== 0)
        return 'unknown';
    if (vip === 1)
        return 'green';
    return vip === 0 ? 'free' : 'unknown';
};
const userVipResult = async (session, options = {}) => {
    try {
        if (!session)
            throw new QqApiError('auth-missing');
        const upstream = await createSessionMusicuClient(session, options).execute(descriptor(session));
        return okResult({ isVip: upstream.iVipFlag === 1, vipLevel: vipLevelOf(upstream), upstream });
    }
    catch (error) {
        return failureResult('get-user-vip', error);
    }
};

const userVip = async (request) => userVipResult(await (await request.service()).resolveSession(request.token));

// src/services/recommend/catalog.ts
//
// `/recommend/categories`、`/recommend/category-playlists`、`/recommend/new-songs`：公开内容，一律匿名读，
// 带了会话也不用。Node 与 serverless 共用。实测（2026-10，匿名）：分类是 `get_hot_category`，分类歌单是
// `get_category_content`（`content.total_cnt`＋`v_item[].basic`），新歌是 `get_new_song_info`（`songlist` 与
// `track_info` 同形、`lanlist` 是地区）。
const DEFAULT_PAGE_SIZE = 20;
/** 网页和旧路由一次要 40 张都拿得到；更大的没有验证过。 */
const MAX_PAGE_SIZE = 40;
/** 上游的「最新」。 */
const DEFAULT_NEW_SONG_AREA = 5;
const positiveIdOf$1 = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
const countOf$3 = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
/** 必填的 id：只认纯数字的正整数。 */
const requiredIdOf = (raw) => {
    const text = String(raw ?? '');
    const value = /^\d{1,15}$/.test(text) ? positiveIdOf$1(Number(text)) : undefined;
    if (value === undefined)
        throw new QqApiError('input');
    return value;
};
/** 分页参数和其他路由一样宽松：不是正整数就用默认值，超过上限就压到上限。 */
const pagingOf$1 = (raw, fallback, max = Number.MAX_SAFE_INTEGER) => {
    const value = Number.parseInt(String(raw ?? ''), 10);
    if (!Number.isSafeInteger(value) || value <= 0)
        return fallback;
    return Math.min(max, value);
};
const listOf = (value) => {
    if (value !== null && value !== undefined && !Array.isArray(value))
        throw new QqApiError('invalid-response');
    return Array.isArray(value) ? value : [];
};
const decodeDictionary = (data) => {
    if (!isDictionary(data))
        throw new QqApiError('invalid-response');
    return data;
};
const anonymous = (options) => createSessionMusicuClient(null, options);
// ---- 歌单分类 ----
const CATEGORIES = {
    module: 'music.web_category_svr',
    method: 'get_hot_category',
    param: { qq: '' },
    readOnly: true,
    operation: 'recommend.categories',
    decode: decodeDictionary,
};
const toCategory = (entry) => {
    const item = dictionaryOf(entry);
    const id = positiveIdOf$1(item.item_id);
    return id === undefined ? null : { id, name: stringOf(item.item_name) };
};
/** 没有可用分类的组跳过；上游给空清单回 422，给了组却一个分类都读不出来回 502。 */
const playlistCategoriesResult = async (options = {}) => {
    try {
        const groups = listOf((await anonymous(options).execute(CATEGORIES)).category);
        if (!groups.length)
            throw new QqApiError('not-found');
        const readable = groups
            .map((entry) => {
            const group = dictionaryOf(entry);
            const categories = Array.isArray(group.items)
                ? group.items.map(toCategory).filter(Boolean)
                : [];
            const id = positiveIdOf$1(group.group_id);
            return categories.length && id !== undefined
                ? { id, name: stringOf(group.group_name), categories }
                : null;
        })
            .filter(Boolean);
        if (!readable.length)
            throw new QqApiError('invalid-response');
        return okResult({ groups: readable });
    }
    catch (error) {
        return failureResult('get-playlist-categories', error);
    }
};
// ---- 分类歌单 ----
const categoryPlaylists = (id, page, size) => ({
    module: 'music.playlist.PlayListCategory',
    method: 'get_category_content',
    param: { caller: '0', category_id: id, page: page - 1, size, use_page: 1 },
    readOnly: true,
    operation: 'recommend.category-playlists',
    decode: decodeDictionary,
});
const creatorOf$1 = (creator) => {
    const uin = typeof creator.uin === 'number' && Number.isSafeInteger(creator.uin)
        ? String(creator.uin)
        : typeof creator.uin === 'string' && /^\d+$/.test(creator.uin)
            ? creator.uin
            : undefined;
    return {
        ...(uin === undefined ? {} : { uin }),
        ...Object.fromEntries(['nick', 'avatar']
            .filter((key) => typeof creator[key] === 'string' && creator[key] !== '')
            .map((key) => [key, creator[key]])),
    };
};
/** 和 `/recommend/playlists` 同一套字段名；没有可用 tid 的跳过，数字缺失就不给。 */
const toPlaylist$1 = (entry) => {
    const item = dictionaryOf(dictionaryOf(entry).basic);
    const tid = positiveIdOf$1(item.tid);
    if (tid === undefined)
        return null;
    const playCount = countOf$3(item.play_cnt);
    const cover = dictionaryOf(item.cover);
    return {
        tid,
        title: stringOf(item.title),
        desc: stringOf(item.desc),
        picurl: [cover.big_url, cover.medium_url, cover.small_url, cover.default_url]
            .map(stringOf)
            .find((url) => url !== '') ?? '',
        ...(playCount === undefined ? {} : { play_cnt: playCount }),
        creator: creatorOf$1(dictionaryOf(item.creator)),
    };
};
/**
 * 对外 page 从 1 开始，上游 page 减 1；total 只看 content.total_cnt，不混用其他来源的 total。
 * 空页回 422；给了条目却一张都读不出来回 502。
 */
const categoryPlaylistsResult = async (raw, options = {}) => {
    try {
        const id = requiredIdOf(raw.id);
        const page = pagingOf$1(raw.page, 1);
        const size = pagingOf$1(raw.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
        const data = await anonymous({ ...options, anonymousUin: 0 }).execute(categoryPlaylists(id, page, size));
        if (typeof data.retcode !== 'number' || !Number.isSafeInteger(data.retcode))
            throw new QqApiError('invalid-response');
        if (data.retcode !== 0)
            throw new QqApiError('upstream-business');
        if (!isDictionary(data.content) || !Array.isArray(data.content.v_item))
            throw new QqApiError('invalid-response');
        const entries = listOf(data.content.v_item);
        if (!entries.length)
            throw new QqApiError('not-found');
        const playlists = entries.map(toPlaylist$1).filter(Boolean);
        if (!playlists.length)
            throw new QqApiError('invalid-response');
        const total = countOf$3(data.content.total_cnt);
        return okResult({
            playlists,
            ...(total === undefined ? {} : { total }),
            more: total !== undefined && page * size < total,
        });
    }
    catch (error) {
        return failureResult('get-category-playlists', error);
    }
};
// ---- 新歌速递 ----
const newSongs = (area) => ({
    module: 'newsong.NewSongServer',
    method: 'get_new_song_info',
    param: { type: area },
    readOnly: true,
    operation: 'recommend.new-songs',
    decode: decodeDictionary,
});
const toArea = (entry) => {
    const item = dictionaryOf(entry);
    const id = positiveIdOf$1(item.type);
    return id === undefined ? null : { id, name: stringOf(item.name) };
};
/** `area` 不给就是「最新」；给了就要是正整数。歌曲条目原样交出去；没有歌回 422。 */
const newSongsResult = async (rawArea, options = {}) => {
    try {
        const area = rawArea === undefined || rawArea === null || rawArea === ''
            ? DEFAULT_NEW_SONG_AREA
            : requiredIdOf(rawArea);
        const data = await anonymous(options).execute(newSongs(area));
        const songs = listOf(data.songlist);
        if (!songs.length)
            throw new QqApiError('not-found');
        const areas = Array.isArray(data.lanlist) ? data.lanlist.map(toArea).filter(Boolean) : [];
        return okResult({ area: positiveIdOf$1(data.type) ?? area, songs, areas });
    }
    catch (error) {
        return failureResult('get-new-songs', error);
    }
};

const decode$1 = (data) => {
    if (!isDictionary(data))
        throw new QqApiError('invalid-response');
    const { tracks, extras } = data;
    // 上游没有歌时给的是 null，和空数组同样当作「没有」；其他类型是格式变了。
    if (tracks !== null && tracks !== undefined && !Array.isArray(tracks))
        throw new QqApiError('invalid-response');
    return {
        tracks: Array.isArray(tracks) ? tracks : [],
        ...(Array.isArray(extras) ? { extras } : {}),
    };
};
const GUESS_YOU_LIKE = {
    module: 'music.radioProxy.MbTrackRadioSvr',
    method: 'get_radio_track',
    // 实测可用的参数组；num 再大也只回 5 首。
    param: { id: 99, firstplay: 1, num: 15 },
    readOnly: true,
    operation: 'recommend.guess-you-like',
    decode: decode$1,
};
/** 没有会话回 401（不把匿名结果当成个人推荐）；上游成功但没有歌回 422。 */
const guessYouLikeResult = async (session, options = {}) => {
    try {
        if (!session)
            throw new QqApiError('auth-missing');
        const data = await createSessionMusicuClient(session, options).execute(GUESS_YOU_LIKE);
        if (!data.tracks.length)
            throw new QqApiError('not-found');
        // 条目原样交出去，由前端自己正规化。
        return okResult({ songs: data.tracks, ...(data.extras ? { extras: data.extras } : {}) });
    }
    catch (error) {
        return failureResult('get-guess-you-like', error);
    }
};

// src/services/recommend/radio.ts
//
// `/radio/list` 与 `/radio/tracks`：QQ 的电台。两条都要先登录（没会话回 401）。Node 与 serverless 共用。
// 实测（2026-10，官方网页）：清单是 `pf.radiosvr/GetRadiolist`（分组 → `list[]` 电台）；猜你喜欢（id 99）
// 走 `get_radio_track`，其他电台走 `pf.radiosvr/GetRadiosonglist`，歌曲条目与 `track_info` 同形。
/** 猜你喜欢电台的 id；它有自己的接口和推荐理由。 */
const PERSONAL_RADIO_ID = 99;
const positiveIdOf = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
const countOf$2 = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
/** 只认纯数字的正整数，其他写法（小数、带字母、负数、0）一律是参数错误。 */
const radioIdOf = (raw) => {
    const text = String(raw ?? '');
    if (!/^\d{1,15}$/.test(text))
        return undefined;
    return positiveIdOf(Number(text));
};
const decodeList = (data) => {
    if (!isDictionary(data))
        throw new QqApiError('invalid-response');
    const groups = data.radio_list;
    if (groups !== null && groups !== undefined && !Array.isArray(groups))
        throw new QqApiError('invalid-response');
    return { groups: Array.isArray(groups) ? groups : [] };
};
const radioList = (session) => ({
    module: 'pf.radiosvr',
    method: 'GetRadiolist',
    param: { uin: credentialMusicId(session.credential) },
    readOnly: true,
    operation: 'recommend.radio-list',
    decode: decodeList,
});
const toRadio = (entry) => {
    const radio = dictionaryOf(entry);
    const id = positiveIdOf(radio.id);
    if (id === undefined)
        return null;
    const listenNum = countOf$2(radio.listenNum);
    return {
        id,
        title: stringOf(radio.title),
        picurl: stringOf(radio.pic_url),
        ...(listenNum === undefined ? {} : { listenNum }),
    };
};
/** 分组没有可用 id 就跳过；电台同理。空分组（例如还没听过电台时的「最近」）照样保留。 */
const toGroup = (entry) => {
    const group = dictionaryOf(entry);
    const id = positiveIdOf(group.id);
    if (id === undefined)
        return null;
    const radios = Array.isArray(group.list) ? group.list.map(toRadio).filter(Boolean) : [];
    return { id, title: stringOf(group.title), radios };
};
/** 上游给空清单回 422；给了分组却一组都读不出来回 502。 */
const radioListResult = async (session, options = {}) => {
    try {
        if (!session)
            throw new QqApiError('auth-missing');
        const data = await createSessionMusicuClient(session, options).execute(radioList(session));
        if (!data.groups.length)
            throw new QqApiError('not-found');
        const groups = data.groups.map(toGroup).filter(Boolean);
        if (!groups.length)
            throw new QqApiError('invalid-response');
        return okResult({ groups });
    }
    catch (error) {
        return failureResult('get-radio-list', error);
    }
};
const decodeSongs = (data) => {
    if (!isDictionary(data))
        throw new QqApiError('invalid-response');
    const tracks = data.track_list;
    if (tracks !== null && tracks !== undefined && !Array.isArray(tracks))
        throw new QqApiError('invalid-response');
    return { tracks: Array.isArray(tracks) ? tracks : [] };
};
const radioSongs = (id) => ({
    module: 'pf.radiosvr',
    method: 'GetRadiosonglist',
    // 网页实测的参数组：一次 9 首。
    param: { id, firstplay: 0, num: 9 },
    readOnly: true,
    operation: 'recommend.radio-tracks',
    decode: decodeSongs,
});
/**
 * 没会话先回 401，再检查 id。99 和猜你喜欢同一个接口、同样带推荐理由；其他电台没有 extras。
 * 歌曲条目原样交出去，由前端自己正规化；上游成功但没有歌回 422。
 */
const radioTracksResult = async (session, rawId, options = {}) => {
    try {
        if (!session)
            throw new QqApiError('auth-missing');
        const id = radioIdOf(rawId);
        if (id === undefined)
            throw new QqApiError('input');
        const client = createSessionMusicuClient(session, options);
        if (id === PERSONAL_RADIO_ID) {
            const data = await client.execute(GUESS_YOU_LIKE);
            if (!data.tracks.length)
                throw new QqApiError('not-found');
            return okResult({ songs: data.tracks, ...(data.extras ? { extras: data.extras } : {}) });
        }
        const data = await client.execute(radioSongs(id));
        if (!data.tracks.length)
            throw new QqApiError('not-found');
        return okResult({ songs: data.tracks });
    }
    catch (error) {
        return failureResult('get-radio-tracks', error);
    }
};

// src/services/recommend/recommendPlaylists.ts
//
// `/recommend/playlists`：歌单广场的推荐。有会话就带凭证，没有就匿名。Node 与 serverless 共用。
// 实测（2026-10）：参数是 `{ From, Size }`；条目在 `List[].Playlist.basic`。翻页不像有限列表
// （From 往后仍有条目、HasMore 却变 false），所以只开放 limit，不提供续读位置。
const DEFAULT_LIMIT$1 = 25;
/** 实测一次要 60 张能拿到 60 张；更大的没有验证过。 */
const MAX_LIMIT$1 = 60;
/** 和其他路由的分页参数一样宽松：不是正整数就用默认值，超过上限就压到上限。 */
const recommendPlaylistsLimitOf = (raw) => {
    const value = Number.parseInt(String(raw ?? ''), 10);
    if (!Number.isSafeInteger(value) || value <= 0)
        return DEFAULT_LIMIT$1;
    return Math.min(MAX_LIMIT$1, value);
};
const decode = (data) => {
    if (!isDictionary(data))
        throw new QqApiError('invalid-response');
    const { List: list, HasMore: hasMore } = data;
    if (list !== null && list !== undefined && !Array.isArray(list))
        throw new QqApiError('invalid-response');
    return { list: Array.isArray(list) ? list : [], hasMore: hasMore === true };
};
const recommendFeed = (limit) => ({
    module: 'music.playlist.PlaylistSquare',
    method: 'GetRecommendFeed',
    param: { From: 0, Size: limit },
    readOnly: true,
    operation: 'recommend.playlists',
    decode,
});
const countOf$1 = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
const coverOf = (cover) => [cover.default_url, cover.big_url, cover.medium_url, cover.small_url]
    .map(stringOf)
    .find((url) => url !== '') ?? '';
const creatorOf = (creator) => Object.fromEntries(['uin', 'encrypt_uin', 'nick', 'avatar']
    .filter((key) => typeof creator[key] === 'string')
    .map((key) => [key, creator[key]]));
/**
 * 摊平成歌单列表常用的字段名（`tid`、`title`、`picurl`、`songnum`……），前端认歌单的那套读法就能用。
 * 没有可用 tid 的条目读不了歌，直接跳过；数字缺失就不给，不补 0。
 */
const toPlaylist = (entry) => {
    const basic = dictionaryOf(dictionaryOf(dictionaryOf(entry).Playlist).basic);
    const tid = basic.tid;
    if (typeof tid !== 'number' || !Number.isSafeInteger(tid) || tid <= 0)
        return null;
    const songnum = countOf$1(basic.song_cnt);
    const playCount = countOf$1(basic.play_cnt);
    return {
        tid,
        title: stringOf(basic.title),
        desc: stringOf(basic.desc),
        picurl: coverOf(dictionaryOf(basic.cover)),
        ...(songnum === undefined ? {} : { songnum }),
        ...(playCount === undefined ? {} : { play_cnt: playCount }),
        creator: creatorOf(dictionaryOf(basic.creator)),
    };
};
/**
 * 会话解不开时由宿主传 `null`，这里就匿名读；解得开但上游拒绝凭证时回 401，让前端清掉坏会话。
 * 上游给空列表回 422；给了条目但一张都读不出来回 502；部分能读照样 200，跳过的条数写进诊断。
 * `more` 原样反映上游的 HasMore，只是提示，不代表读完。
 */
const recommendPlaylistsResult = async (session, limit, options = {}) => {
    try {
        const data = await createSessionMusicuClient(session, options).execute(recommendFeed(limit));
        // 上游真的给了空列表才是「没有数据」；给了条目却一张都读不出来，是格式变了。
        if (!data.list.length)
            throw new QqApiError('not-found');
        const playlists = data.list.map(toPlaylist).filter((item) => item !== null);
        if (!playlists.length)
            throw new QqApiError('invalid-response');
        if (playlists.length < data.list.length)
            diagnose('get-recommend-playlists', {
                status: 200,
                receivedEntries: data.list.length,
                skippedEntries: data.list.length - playlists.length,
            });
        return okResult({ playlists, more: data.hasMore });
    }
    catch (error) {
        return failureResult('get-recommend-playlists', error);
    }
};

// src/services/search/search.ts
//
// `/search`：按关键字搜歌曲、专辑、歌单、歌手。Node 与 serverless 共用。
// 实测（2026-10）：精简版搜索方法用不签名的 musicu 就能读。有会话时带会话，四种类型都有结果；
// 没有会话时用精简版的匿名身份，专辑、歌单、歌手有结果，歌曲常被上游以 2001 拒绝。
// 单项码不是 0 时清单也是空的，一律当失败，不当成「没有结果」。
const SEARCH_TYPES = ['song', 'album', 'playlist', 'singer'];
const SEARCH_TYPE_CODES = { song: 0, singer: 1, album: 2, playlist: 3 };
/** 精简版把各类型的条目直接放在 `body` 下的数组里，歌手那组没有 `item_` 前缀。 */
const LIST_KEYS = {
    song: 'item_song',
    singer: 'singer',
    album: 'item_album',
    playlist: 'item_songlist',
};
const REMOTE_PLACE = 'search.android.keyboard';
/**
 * 精简版客户端的匿名身份：只放协议需要的应用与版本常数，不带任何设备指纹。
 * 标头里的 `tmeLoginType=-1` 表示未登录。
 */
const ANONYMOUS_LITE_COMM = {
    ct: 11,
    cv: '1003006',
    v: '1003006',
    tmeAppID: 'qqmusiclight',
    nettype: 'NETWORK_WIFI',
    udid: '0',
    uid: '0',
};
const ANONYMOUS_LITE_HEADERS = { Cookie: 'tmeLoginType=-1', 'User-Agent': 'okhttp/3.14.9' };
const DEFAULT_LIMIT = 10;
/** 实测验证过一页 10 与 20 条；更大的没有验证过。 */
const MAX_LIMIT = 20;
/** 精简版客户端最多送 60 个字。 */
const MAX_KEYWORD_LENGTH = 60;
/** 不给类型就是歌曲；给了不认识的值算参数错误。 */
const searchTypeOf = (raw) => {
    if (raw === undefined || raw === null || raw === '')
        return 'song';
    const type = SEARCH_TYPES.find((value) => value === raw);
    if (type === undefined)
        throw new QqApiError('input');
    return type;
};
const keywordOf = (raw) => {
    const keyword = typeof raw === 'string' ? raw.trim() : '';
    if (!keyword || keyword.length > MAX_KEYWORD_LENGTH)
        throw new QqApiError('input');
    return keyword;
};
/** 分页参数和其他路由一样宽松：不是正整数就用默认值，超过上限就压到上限。 */
const pagingOf = (raw, fallback, max = Number.MAX_SAFE_INTEGER) => {
    const value = Number.parseInt(String(raw ?? ''), 10);
    if (!Number.isSafeInteger(value) || value <= 0)
        return fallback;
    return Math.min(max, value);
};
const countOf = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
/** 每次搜索带一个随机数字串；不需要密码学强度，也不能依赖 `node:*`。 */
const searchIdOf = () => `${Math.floor(Math.random() * 9 + 1)}${Array.from({ length: 17 }, () => Math.floor(Math.random() * 10)).join('')}`;
const decoderFor = (type) => (data) => {
    if (!isDictionary(data) || !isDictionary(data.body) || !isDictionary(data.meta))
        throw new QqApiError('invalid-response');
    // 实测成功时内层 code 是 0；非 0 的意思没有分离，不当成功。
    if (data.code !== undefined && data.code !== 0)
        throw new QqApiError('invalid-response');
    const list = data.body[LIST_KEYS[type]];
    if (!Array.isArray(list))
        throw new QqApiError('invalid-response');
    const items = list.filter(isDictionary);
    if (items.length < list.length)
        throw new QqApiError('invalid-response');
    const { nextpage } = data.meta;
    return {
        items,
        total: countOf(data.meta.sum),
        more: typeof nextpage === 'number' && Number.isSafeInteger(nextpage) && nextpage > 0,
    };
};
const searchRequest = (type, keyword, page, limit) => ({
    module: 'music.search.SearchCgiService',
    method: 'DoSearchForQQMusicLite',
    param: {
        search_id: searchIdOf(),
        remoteplace: REMOTE_PLACE,
        query: keyword,
        search_type: SEARCH_TYPE_CODES[type],
        num_per_page: limit,
        page_num: page,
        highlight: 0,
        nqc_flag: 0,
        page_id: 1,
        grp: 1,
    },
    readOnly: true,
    operation: 'search',
    decode: decoderFor(type),
});
const clientFor = (session, options) => session
    ? createSessionMusicuClient(session, options)
    : createMusicuClient({
        http: createFetchTransport(options.fetcher),
        comm: ANONYMOUS_LITE_COMM,
        headers: ANONYMOUS_LITE_HEADERS,
    });
/**
 * 条目原样交出去（保留各种 MID），由调用方自己整理。有会话就带会话，没有就匿名搜。
 * 搜不到回 200 加空清单；`total` 取上游 `meta.sum`，`more` 只看上游的下一页标记。
 */
const searchResult = async (raw, session, options = {}) => {
    try {
        const type = searchTypeOf(raw.type);
        const keyword = keywordOf(raw.keyword);
        const page = pagingOf(raw.page, 1);
        const limit = pagingOf(raw.limit, DEFAULT_LIMIT, MAX_LIMIT);
        const data = await clientFor(session, options).execute(searchRequest(type, keyword, page, limit));
        return okResult({
            type,
            page,
            limit,
            ...(data.total === undefined ? {} : { total: data.total }),
            more: data.more,
            items: data.items,
        });
    }
    catch (error) {
        return failureResult('search', error);
    }
};

/**
 * Sealed sessions: the `sealed` half of the `SessionResolver` port, for runtimes that have nowhere
 * to keep process state. The credential travels inside the token, encrypted, instead of being kept
 * on a server that the next request might not reach.
 *
 * Deliberately built on `globalThis.crypto.subtle` rather than `node:crypto`, which is the mirror
 * image of the decision in `services/auth/sessionCrypto.ts`: that module is synchronous because the
 * repository contract Electron depends on is synchronous, and this one is async because Workers
 * only offer Web Crypto. The envelope discipline is the same in both — one key per purpose, and the
 * purpose bound into the ciphertext — but the serialisation differs because the constraints do: a
 * file can hold pretty-printed JSON, a token has to survive a URL.
 *
 * Nothing here imports the Koa app, the config barrel or anything reaching `node:fs`.
 */
/** HKDF `info` values. Different `info` is what makes the three keys cryptographically unrelated. */
const SEALED_AUTH_PURPOSE = 'qq-music-api/v1/sealed-auth';
const SEALED_QR_PURPOSE = 'qq-music-api/v1/sealed-qr';
const DERIVED_DEVICE_PURPOSE = 'qq-music-api/v1/derived-device';
/** Its own namespace, not a sub-key of another purpose: the key id is public, the others are not. */
const KEY_ID_PURPOSE = 'qq-music-api/v1/sealed-kid';
const TOKEN_PREFIX = 'qq1';
const KEY_BITS = 256;
const IV_BYTES = 12;
const KID_BYTES = 6;
/**
 * One character per purpose in the wire format. Kept separate from the `info` strings so the token
 * stays short while the key derivation keeps its self-describing, collision-proof names.
 */
const PURPOSE_TAGS = {
    [SEALED_AUTH_PURPOSE]: 'a',
    [SEALED_QR_PURPOSE]: 'q',
};
class SealedSessionError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SealedSessionError';
    }
}
const encoder = new TextEncoder();
const decoder = new TextDecoder();
// `Uint8Array<ArrayBuffer>` rather than the default `Uint8Array<ArrayBufferLike>` throughout:
// Web Crypto's `BufferSource` excludes `SharedArrayBuffer`, so the narrower buffer type is what
// lets these values be passed straight to `subtle` without a cast.
const toBase64Url = (bytes) => {
    let binary = '';
    for (const byte of bytes)
        binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (value, field) => {
    if (!/^[A-Za-z0-9_-]+$/.test(value))
        throw new SealedSessionError(`Token field ${field} is not base64url`);
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    try {
        const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
        return Uint8Array.from(binary, (character) => character.charCodeAt(0));
    }
    catch {
        throw new SealedSessionError(`Token field ${field} is not base64url`);
    }
};
const importSecret = (secret) => globalThis.crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveBits']);
/**
 * HKDF-SHA256 with an empty salt. The salt is omitted rather than forgotten: the input keying
 * material is a deployment secret that is already required to be high-entropy, and a per-token salt
 * cannot be reconstructed at verification time without spending bytes in the token to carry it.
 * Separation comes from `info`, which is exactly what `info` is for.
 */
const deriveBits = async (secret, purpose, bytes) => {
    if (!secret)
        throw new SealedSessionError('A session secret is required');
    const derived = await globalThis.crypto.subtle.deriveBits({
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(0),
        info: encoder.encode(purpose),
    }, await importSecret(secret), bytes * 8);
    return new Uint8Array(derived);
};
const deriveAesKey = async (secret, purpose) => {
    const bits = await deriveBits(secret, purpose, KEY_BITS / 8);
    return globalThis.crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['encrypt', 'decrypt']);
};
/**
 * A short, non-secret label for "which secret sealed this". Derived through its own `info`, so it
 * reveals nothing about the encryption keys, and it is what lets a rotated deployment tell a token
 * it can still open from one it never could.
 */
const deriveKeyId = async (secret) => toBase64Url(await deriveBits(secret, KEY_ID_PURPOSE, KID_BYTES));
const purposeTagOf = (purpose) => {
    const tag = PURPOSE_TAGS[purpose];
    if (!tag)
        throw new SealedSessionError(`Unknown sealed purpose: ${purpose}`);
    return tag;
};
/** AAD binds both the purpose and the key id, so neither can be swapped without failing the tag. */
const additionalData = (purpose, kid) => encoder.encode(`${TOKEN_PREFIX}:${purpose}:${kid}`);
const sealToken = async (payload, purpose, secret) => {
    const tag = purposeTagOf(purpose);
    const kid = await deriveKeyId(secret);
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const sealed = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: additionalData(purpose, kid) }, await deriveAesKey(secret, purpose), encoder.encode(JSON.stringify(payload)));
    return [TOKEN_PREFIX, tag, kid, toBase64Url(iv), toBase64Url(new Uint8Array(sealed))].join('.');
};
const openWithSecret = async (parts, purpose, secret) => {
    let plaintext;
    try {
        plaintext = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: parts.iv, additionalData: additionalData(purpose, parts.kid) }, await deriveAesKey(secret, purpose), parts.ct);
    }
    catch {
        // One message for a wrong key, a wrong purpose and a flipped byte alike. Whoever is holding
        // the token learns only that it did not open.
        throw new SealedSessionError('Token failed authentication');
    }
    try {
        return JSON.parse(decoder.decode(plaintext));
    }
    catch {
        throw new SealedSessionError('Sealed payload is not valid JSON');
    }
};
const openToken = async (token, purpose, secrets) => {
    const expectedTag = purposeTagOf(purpose);
    const segments = token.split('.');
    if (segments.length !== 5 || segments[0] !== TOKEN_PREFIX)
        throw new SealedSessionError('Token is not a sealed session');
    const [, tag, kid, rawIv, rawCt] = segments;
    // Checked before any key work: a QR token presented as an auth token is a shape error, not a
    // cryptographic one, and saying so early keeps the expensive path for real candidates.
    if (tag !== expectedTag)
        throw new SealedSessionError('Token was sealed for another purpose');
    const iv = fromBase64Url(rawIv, 'iv');
    if (iv.length !== IV_BYTES)
        throw new SealedSessionError('Token field iv has an unusable length');
    const parts = { tag, kid, iv, ct: fromBase64Url(rawCt, 'ct') };
    // Only the secret whose key id matches is tried. Without this a rotated deployment would pay
    // two full derivations on every request, and a token sealed by a secret this deployment has
    // retired would be indistinguishable from one it never issued.
    const candidates = [secrets.current, secrets.previous].filter((secret) => typeof secret === 'string' && secret.length > 0);
    for (const secret of candidates) {
        if ((await deriveKeyId(secret)) !== kid)
            continue;
        return openWithSecret(parts, purpose, secret);
    }
    throw new SealedSessionError('Token was sealed by an unknown key');
};

/**
 * The device identity a serverless runtime uses, derived from the deployment secret instead of
 * stored. Node keeps its device in a state file; a Worker has no such file and every invocation
 * may land on a different machine, so the identity has to be reproducible from something the
 * deployment already has.
 *
 * 🔴 The assumption this encodes, which belongs in the deployment documentation: one deployment
 * secret is one device identity, so a deployment is a single-user, personal deployment. Two people
 * sharing one `QQ_SESSION_SECRET` share a device fingerprint upstream. Per-client device identity
 * is a future direction; `SealedTokenV1` carries a version field so it can arrive without breaking
 * tokens already issued.
 *
 * The type is imported type-only on purpose: `AndroidDevice` is a plain interface, and a type-only
 * import is erased before bundling regardless of what the module that declares it pulls in.
 */
const DERIVED_BYTES = 64;
/** Consumes the derived stream in fixed-size bites so field order alone fixes the whole device. */
const createReader = (bytes) => {
    let cursor = 0;
    const take = (count) => {
        // The stream is sized for every field below with room to spare; wrapping keeps a future field
        // from silently reading zeroes if that ever stops being true.
        const slice = new Uint8Array(count);
        for (let index = 0; index < count; index += 1)
            slice[index] = bytes[(cursor + index) % bytes.length];
        cursor += count;
        return slice;
    };
    return {
        hex: (length) => Array.from(take(Math.ceil(length / 2)), (byte) => byte.toString(16).padStart(2, '0'))
            .join('')
            .slice(0, length),
        digits: (length) => Array.from(take(length), (byte) => String(byte % 10)).join(''),
    };
};
/** Same Luhn check digit the random generator applies, so the value stays a well-formed IMEI. */
const imeiFrom = (fourteenDigits) => {
    const digits = fourteenDigits.split('').map(Number);
    let sum = 0;
    for (let index = 0; index < digits.length; index += 1) {
        let digit = digits[index];
        if (index % 2 === 1)
            digit = digit * 2 > 9 ? digit * 2 - 9 : digit * 2;
        sum += digit;
    }
    digits.push((10 - (sum % 10)) % 10);
    return digits.join('');
};
/**
 * Deterministic: the same secret always produces the same device, on every instance, with nothing
 * written down. The constant fields match `createAndroidDevice()` exactly — this is the same
 * device model presented to upstream, only with its variable parts derived rather than rolled.
 */
const deriveAndroidDevice = async (secret) => {
    const read = createReader(await deriveBits(secret, DERIVED_DEVICE_PURPOSE, DERIVED_BYTES));
    return {
        display: `QMAPI.${read.digits(6)}.001`,
        product: 'iarim',
        device: 'sagit',
        board: 'eomam',
        model: 'MI 6',
        fingerprint: `xiaomi/iarim/sagit:10/eomam.200122.001/${read.digits(7)}:user/release-keys`,
        procVersion: `Linux 5.4.0-54-generic-${read.hex(8)} (android-build@google.com)`,
        imei: imeiFrom(read.digits(14)),
        brand: 'Xiaomi',
        androidId: read.hex(16),
        openUdid: read.hex(32),
        osRelease: '10',
        sdk: 29,
    };
};

/**
 * `AuthHttpClient` over `fetch`. The jar and the redirect rules come from `../services/auth/
 * cookieJar`, so the login protocol behaves identically here and on Node — this file only
 * translates between the axios-shaped config the auth services already speak and a `Request`.
 *
 * 🔴 Redirects are followed by hand (`redirect: 'manual'`) for the same reason the axios client
 * sets `maxRedirects: 0`: the upstream login flow deposits cookies on the redirect hops, and a
 * runtime that follows redirects internally never lets us see those `set-cookie` headers.
 *
 * The `AuthHttpClient` type is imported type-only, so nothing pulls axios into the bundle.
 */
const RESPONSE_TYPES = new Set(['json', 'text', 'arraybuffer']);
/** Every upstream call carries a deadline; see D9. A request with no signal can hang a worker. */
const withDeadline$1 = (signal, budgetMs) => {
    const deadline = AbortSignal.timeout(budgetMs);
    return signal ? AbortSignal.any([signal, deadline]) : deadline;
};
const headerRecord = (headers) => {
    const record = {};
    headers.forEach((value, name) => {
        record[name] = value;
    });
    // `set-cookie` is the one header that legitimately repeats, and a plain record would keep only
    // the last. `getSetCookie()` is what makes the jar see every cookie on a hop.
    const setCookie = headers.getSetCookie?.() ?? [];
    if (setCookie.length > 0)
        record['set-cookie'] = setCookie;
    return record;
};
const readBody = async (response, responseType) => {
    if (responseType === 'arraybuffer')
        return await response.arrayBuffer();
    const text = await response.text();
    if (responseType === 'text')
        return text;
    // Matching axios: a JSON response type that does not parse yields the raw text rather than
    // throwing, because several upstream endpoints answer with `callback({...})` script text.
    try {
        return text === '' ? '' : JSON.parse(text);
    }
    catch {
        return text;
    }
};
const createFetchAuthHttpClient = (options = {}) => {
    const jar = new Map();
    if (options.initialCookies)
        seedCookieJar(jar, options.initialCookies);
    const defaultBudgetMs = options.budgetMs ?? 10_000;
    const request = async (initial) => {
        let config = { ...initial };
        for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
            const configuredHeaders = { ...(config.headers ?? {}) };
            const explicitCookieEntry = Object.entries(configuredHeaders).find(([name]) => name.toLowerCase() === 'cookie');
            if (explicitCookieEntry)
                delete configuredHeaders[explicitCookieEntry[0]];
            const explicitCookies = typeof explicitCookieEntry?.[1] === 'string' ? explicitCookieEntry[1] : '';
            const mergedCookies = mergeCookieHeaders(cookieHeader(jar), explicitCookies);
            const responseType = RESPONSE_TYPES.has(String(config.responseType))
                ? String(config.responseType)
                : 'json';
            const method = String(config.method ?? 'GET').toUpperCase();
            const url = new URL(String(config.url));
            for (const [name, value] of Object.entries(config.params ?? {})) {
                if (value !== undefined && value !== null)
                    url.searchParams.set(name, String(value));
            }
            const headers = new Headers();
            if (config.data !== undefined)
                headers.set('Content-Type', JSON_CONTENT_TYPE);
            for (const [name, value] of Object.entries(configuredHeaders)) {
                if (value !== undefined && value !== null)
                    headers.set(name, String(value));
            }
            if (mergedCookies)
                headers.set('Cookie', mergedCookies);
            const response = await fetch(url, {
                method,
                headers,
                body: config.data === undefined || method === 'GET' || method === 'HEAD'
                    ? undefined
                    : typeof config.data === 'string'
                        ? config.data
                        : JSON.stringify(config.data),
                redirect: 'manual',
                signal: withDeadline$1(config.signal, defaultBudgetMs),
            });
            const responseHeaders = headerRecord(response.headers);
            updateCookieJar(jar, normalizeSetCookies(responseHeaders['set-cookie']));
            const location = response.headers.get('location');
            if (!REDIRECT_STATUSES.has(response.status) || !location) {
                // The same window the axios client accepts, so a 4xx surfaces as a rejection either way.
                if (response.status < 200 || response.status >= 400)
                    throw Object.assign(new Error(`QQ auth request failed with status ${response.status}`), {
                        httpStatus: response.status,
                    });
                return {
                    data: (await readBody(response, responseType)),
                    status: response.status,
                    statusText: response.statusText,
                    headers: responseHeaders,
                    config: config,
                };
            }
            if (redirectCount === MAX_REDIRECTS)
                throw new Error('QQ auth redirect limit exceeded');
            const nextMethod = redirectedMethod(response.status, config.method);
            config = {
                ...config,
                url: new URL(location, url).toString(),
                method: nextMethod,
                // Params were folded into the URL above; re-applying them would double them on the hop.
                params: undefined,
                data: nextMethod === 'GET' ? undefined : config.data,
            };
        }
        throw new Error('QQ auth redirect limit exceeded');
    };
    return {
        getCookieHeader: () => cookieHeader(jar),
        request,
        post: (url, data, config = {}) => request({ ...config, url, data, method: 'POST' }),
    };
};

/**
 * The legacy catalog transport over `fetch`, filling the seam S1 opened.
 *
 * 🔴 The defaults are inlined rather than read from `src/config`. That is the whole point of the
 * seam carrying `defaults`: the catalog services used to read the config barrel directly, and that
 * barrel reaches `config/manager.ts` and therefore `node:fs`, which cannot be bundled for a Worker.
 * The values below mirror `config/default.ts`; a serverless deployment does not have the config
 * file that would let a user override them, so the defaults are the whole story here.
 *
 * The response is adapted into an `AxiosResponse` shape because all 33 catalog services annotate
 * their `.then` callbacks with it. Keeping the shape is what let S1 open this seam without touching
 * any of them.
 */
const DEFAULTS = {
    baseURL: {
        y: 'https://y.qq.com',
        c: 'https://c.y.qq.com',
        u: 'https://u.y.qq.com/cgi-bin/musicu.fcg',
    },
    referer: {
        y: 'https://y.qq.com/',
        c: 'https://c.y.qq.com/',
        u: 'https://y.qq.com/portal/player.html',
    },
    commonParams: {
        g_tk: 1124214810,
        loginUin: '0',
        hostUin: 0,
        inCharset: 'utf8',
        outCharset: 'utf-8',
        notice: 0,
        platform: 'yqq.json',
        needNewCode: 0,
    },
};
const withDeadline = (signal, budgetMs) => {
    const deadline = AbortSignal.timeout(budgetMs);
    return signal ? AbortSignal.any([signal, deadline]) : deadline;
};
const resolveUrl = (url, target) => {
    if (/^https?:\/\//.test(url))
        return url;
    // `u` is already an absolute musicu URL in the seam's contract; `y` and `c` get their base.
    if (target === 'u')
        return DEFAULTS.baseURL.u;
    const base = target === 'c' ? DEFAULTS.baseURL.c : DEFAULTS.baseURL.y;
    return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
};
const refererFor = (target) => target === 'c' ? DEFAULTS.referer.c : target === 'u' ? DEFAULTS.referer.u : DEFAULTS.referer.y;
const createFetchLegacyTransport = (options = {}) => {
    const defaultBudgetMs = options.budgetMs ?? 10_000;
    return {
        kind: 'fetch',
        defaults: DEFAULTS,
        request: async (url, method, config = {}, 
        // Matches `request()` in `util/request.ts`: an omitted target is the catalog default,
        // `c.y.qq.com`. `y_common` (despite its name) never passes a target at all, so getting this
        // wrong sends every one of its calls to the wrong host — see the regression test below.
        target = 'c') => {
            const resolved = new URL(resolveUrl(url, target));
            for (const [name, value] of Object.entries(config.params ?? {})) {
                if (value !== undefined && value !== null)
                    resolved.searchParams.set(name, String(value));
            }
            const headers = new Headers({ Referer: refererFor(target) });
            for (const [name, value] of Object.entries((config.headers ?? {}))) {
                if (value !== undefined && value !== null)
                    headers.set(name, String(value));
            }
            const upper = method.toUpperCase();
            const response = await fetch(resolved, {
                method: upper,
                headers,
                body: config.data === undefined || upper === 'GET' || upper === 'HEAD'
                    ? undefined
                    : typeof config.data === 'string'
                        ? config.data
                        : JSON.stringify(config.data),
                signal: withDeadline(config.signal, defaultBudgetMs),
            });
            const text = await response.text();
            let data = text;
            // The catalog endpoints answer with JSON, and several wrap it in a JSONP callback. Parsing
            // leniently keeps the axios behaviour the services were written against.
            try {
                data = text === '' ? '' : JSON.parse(text);
            }
            catch {
                data = text;
            }
            const responseHeaders = {};
            response.headers.forEach((value, name) => {
                responseHeaders[name] = value;
            });
            return {
                data: data,
                status: response.status,
                statusText: response.statusText,
                headers: responseHeaders,
                config: config,
            };
        },
    };
};

const CHECK_BUDGET_MS = 20_000;
/** Header > query > cookie, the same order the Koa controller applies (§5.3 #2). */
const secretsOf = (env) => ({
    current: env.QQ_SESSION_SECRET ?? '',
    previous: env.QQ_SESSION_SECRET_PREVIOUS,
});
/**
 * 🔴 The single place this runtime decides what it can serve. Three call sites used to hard-code
 * `['wechat']` independently; deriving all of them from the injected relay is what makes "no relay
 * means no `qq`" impossible to get half-right.
 */
const capabilitiesFor = (options) => ({
    channels: options.qqRelay ? ['qq', 'wechat'] : ['wechat'],
    sessionMode: 'sealed',
});
/** The `qq` driver exists only when a relay does; `wechat` keeps the service's own default. */
const driversFor = (options, http, deviceRepository, base) => options.qqRelay
    ? {
        qq: createRelayQqQrDriver({
            http,
            // Read through the repository rather than captured: `createSession` bootstraps QIMEI and
            // the Android session and persists them, so the device the QR is created with has to be
            // the post-bootstrap one, not the deterministic base this repository was seeded with.
            device: () => deviceRepository.load() ?? base,
            relay: options.qqRelay,
        }),
    }
    : undefined;
/**
 * A `QrSessionRepository` that answers `load()` with exactly the record a sealed `unikey` was
 * opened into, and never actually persists anything `/login/qr/create` or `/login/qr/check`
 * mutate — there is nowhere to write it back to, and nothing past this one call needs it.
 */
const replayQrSessionRepository = (records) => ({
    kind: 'sealed-replay',
    load: () => records,
    save: () => undefined,
});
/**
 * Rebuilds one QR record from a sealed payload.
 *
 * 🔴 `qrcodeId` is not a duplicate of `identifier`: `exchangeQqLogin` reads *that* field as the
 * `qrCodeID` exchange parameter, and a record that carries only `identifier` fails at the very last
 * step of a successful scan — after the user has already approved on their phone. The App channel
 * is the only one where the two fields both apply, which is why `createQr` sets both.
 */
const replayedRecord = (key, payload, state) => ({
    key,
    channel: payload.channel,
    state,
    createdAt: payload.createdAt,
    expiresAt: payload.expiresAt,
    identifier: payload.identifier,
    ...(payload.channel === 'qq' ? { qrcodeId: payload.identifier } : {}),
});
/**
 * A `QrSessionRepository` that starts empty and remembers the last thing saved into it, so
 * `/login/qr/key` can read back the record `createSession` + `createQr` just built — the state
 * that has to be sealed into the `unikey` — without `QrLoginService` exposing it directly.
 */
const capturingQrSessionRepository = () => {
    let saved = [];
    return {
        repository: {
            kind: 'sealed-capture',
            load: () => [],
            save: (sessions) => {
                saved = sessions.slice();
            },
        },
        latest: () => saved,
    };
};
/** Layers the live fields a fresh isolate cannot re-derive onto the deterministic base device. */
const withQrDeviceState = (base, saved) => saved
    ? {
        ...base,
        ...(saved.qimei === undefined ? {} : { qimei: saved.qimei }),
        ...(saved.qimei36 === undefined ? {} : { qimei36: saved.qimei36 }),
        ...(saved.qimeiSavedAt === undefined ? {} : { qimeiSavedAt: saved.qimeiSavedAt }),
        ...(saved.sessionUid === undefined ? {} : { sessionUid: saved.sessionUid }),
        ...(saved.sessionSid === undefined ? {} : { sessionSid: saved.sessionSid }),
        ...(saved.sessionVkey === undefined ? {} : { sessionVkey: saved.sessionVkey }),
    }
    : base;
const qrDeviceRepositoryFor = async (secrets, saved) => {
    const base = withQrDeviceState(await deriveAndroidDevice(secrets.current), saved);
    return { repository: createMemoryDeviceContextRepository(base), base };
};

const isDeviceState = (value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const candidate = value;
    const optionalText = (key) => candidate[key] === undefined || typeof candidate[key] === 'string';
    return (optionalText('qimei') &&
        optionalText('qimei36') &&
        optionalText('sessionUid') &&
        optionalText('sessionSid') &&
        (candidate.qimeiSavedAt === undefined || Number.isFinite(candidate.qimeiSavedAt)));
};
const isSealedQrPayload = (value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const candidate = value;
    return (candidate.v === 1 &&
        isSupportedLoginChannel(candidate.channel) &&
        Number.isFinite(candidate.createdAt) &&
        Number.isFinite(candidate.expiresAt) &&
        typeof candidate.identifier === 'string' &&
        candidate.identifier.length > 0 &&
        typeof candidate.cookies === 'string' &&
        isDeviceState(candidate.device));
};
/** Seals a freshly created QR session's state into the token that becomes the client's `unikey`. */
const sealQrState = (payload, secret) => sealToken({ v: 1, ...payload }, SEALED_QR_PURPOSE, secret);
/**
 * Opens a `unikey` back into the state it was sealed with. Answers `null` for anything that is not
 * a live, authentic QR token — tampered, foreign-purpose, unopenable with either secret, malformed,
 * or past `expiresAt` — so a caller can treat "no session" uniformly, exactly like `sessionFor` did
 * for the in-memory store this replaces.
 */
const openQrState = async (token, secrets, now) => {
    let payload;
    try {
        payload = await openToken(token, SEALED_QR_PURPOSE, secrets);
    }
    catch (error) {
        if (error instanceof SealedSessionError)
            return null;
        throw error;
    }
    if (!isSealedQrPayload(payload))
        return null;
    if (payload.expiresAt <= now)
        return null;
    return payload;
};

/**
 * The `sealed` backend for the `SessionResolver` port.
 *
 * Two things make it behave differently from `stored`, and both are deliberate:
 *
 * - `revoke()` is a no-op. There is no server-side record to delete, so a sealed token stays
 *   usable until it expires and logout means the client discarding it. A denylist would reintroduce
 *   exactly the shared mutable state this mode exists to avoid; the exposure is bounded by the
 *   session lifetime instead.
 * - The credential is reduced to an allowlist before it is sealed. Whatever new fields upstream
 *   starts returning, they do not silently become part of a token that travels through clients.
 */
/**
 * `SealedCredentialV1` — the nine fields a session actually needs downstream. Everything else in a
 * `QqCredential` is dropped.
 *
 * 🔴 `refresh_key` and `refresh_token` are excluded by design, not by oversight. They extend an
 * account's reach far past the session itself, and keeping them out is what bounds the blast radius
 * of a leaked token to the session lifetime rather than the refresh lifetime.
 */
const SEALED_CREDENTIAL_FIELDS = [
    'musicid',
    'str_musicid',
    'musickey',
    'loginType',
    'encryptUin',
    'nick',
    'nickname',
    'logo',
    'avatarUrl',
];
/** Drops every field outside the allowlist, and every allowlisted field that is absent upstream. */
const toSealedCredential = (credential) => {
    const reduced = {};
    for (const field of SEALED_CREDENTIAL_FIELDS) {
        const value = credential[field];
        if (value !== undefined)
            reduced[field] = value;
    }
    return reduced;
};
const isSealedPayload = (value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const candidate = value;
    return (candidate.v === 1 &&
        typeof candidate.iat === 'number' &&
        Number.isFinite(candidate.iat) &&
        typeof candidate.exp === 'number' &&
        Number.isFinite(candidate.exp) &&
        typeof candidate.cred === 'object' &&
        candidate.cred !== null &&
        !Array.isArray(candidate.cred));
};
/**
 * A decrypted payload is authentic but still has to be a usable credential: authentication proves
 * the deployment wrote it, not that upstream returned everything the session needs.
 */
const isUsableCredential = (value) => {
    const hasMusicId = (typeof value.musicid === 'string' && value.musicid.length > 0) ||
        (typeof value.musicid === 'number' && Number.isFinite(value.musicid));
    return (hasMusicId &&
        typeof value.musickey === 'string' &&
        value.musickey.length > 0 &&
        typeof value.loginType === 'number' &&
        Number.isFinite(value.loginType));
};
const createSealedSessionResolver = (options) => {
    const now = options.now ?? Date.now;
    return {
        mode: 'sealed',
        issue: async (session) => sealToken({
            v: 1,
            iat: now(),
            exp: session.expiresAt,
            cred: toSealedCredential(session.credential),
        }, SEALED_AUTH_PURPOSE, options.secrets.current),
        resolve: async (token) => {
            if (!token)
                return null;
            let payload;
            try {
                payload = await openToken(token, SEALED_AUTH_PURPOSE, options.secrets);
            }
            catch (error) {
                // A token that does not open is simply not logged in. Distinguishing "tampered" from
                // "expired secret" for the caller would only help someone probing the deployment.
                if (error instanceof SealedSessionError)
                    return null;
                throw error;
            }
            if (!isSealedPayload(payload))
                return null;
            // Expiry is inside the ciphertext, so GCM already proved nobody moved it. Checking it here
            // is what replaces the stored backend's periodic cleanup.
            if (payload.exp <= now())
                return null;
            if (!isUsableCredential(payload.cred))
                return null;
            return {
                token,
                credential: payload.cred,
                device: await deriveAndroidDevice(options.secrets.current),
                expiresAt: payload.exp,
            };
        },
        // Intentionally empty: see the note at the top of this file.
        revoke: async () => { },
    };
};

// 每次请求的封存状态和服务组合，保留原入口的设备、Cookie 与 relay 生命周期。
const createServerlessQrOperations = ({ env, options, service: getService, }) => ({
    createSession: async (channel) => {
        const secrets = secretsOf(env);
        const { repository: deviceRepository, base } = await qrDeviceRepositoryFor(secrets);
        const qrSessions = capturingQrSessionRepository();
        let qrSessionHttp;
        const http = createFetchAuthHttpClient();
        const service = createQrLoginService({
            http,
            createSessionHttp: () => (qrSessionHttp = createFetchAuthHttpClient()),
            deviceRepository,
            sessionResolver: createSealedSessionResolver({ secrets }),
            qrSessionRepository: qrSessions.repository,
            capabilities: capabilitiesFor(options),
            drivers: driversFor(options, http, deviceRepository, base),
            checkBudgetMs: CHECK_BUDGET_MS,
        });
        const key = await service.createSession(channel);
        await service.createQr(key);
        const record = qrSessions.latest().find((session) => session.key === key);
        // `createQr` either finished with an `identifier` on this exact record or threw —
        // reaching here without one would be a bug in this function, not a caller error.
        if (!record?.identifier) {
            throw new Error('QR session has no upstream QR after createQr()');
        }
        const device = deviceRepository.load() ?? (await deriveAndroidDevice(secrets.current));
        const unikey = await sealQrState({
            channel: record.channel,
            createdAt: record.createdAt,
            expiresAt: record.expiresAt,
            identifier: record.identifier,
            // The WeChat web flow's cookie jar at the moment the QR was created — see the module
            // doc on `sealedQrState.ts` for why a fresh isolate cannot rebuild this on its own.
            // 🔴 The image itself is deliberately not sealed here; see the same module doc.
            cookies: qrSessionHttp?.getCookieHeader() ?? '',
            device: {
                qimei: device.qimei,
                qimei36: device.qimei36,
                qimeiSavedAt: device.qimeiSavedAt,
                sessionUid: device.sessionUid,
                sessionSid: device.sessionSid,
                sessionVkey: device.sessionVkey,
            },
        }, secrets.current);
        return unikey;
    },
    createQr: async (key) => {
        const secrets = secretsOf(env);
        const payload = await openQrState(key, secrets, Date.now());
        if (!payload) {
            throw new QrLoginServiceError('QR session not found or expired', 404);
        }
        const { repository: deviceRepository, base } = await qrDeviceRepositoryFor(secrets, payload.device);
        const http = createFetchAuthHttpClient();
        const service = createQrLoginService({
            http,
            createSessionHttp: () => createFetchAuthHttpClient({ initialCookies: payload.cookies }),
            deviceRepository,
            sessionResolver: createSealedSessionResolver({ secrets }),
            qrSessionRepository: replayQrSessionRepository([replayedRecord(key, payload, 'created')]),
            capabilities: capabilitiesFor(options),
            drivers: driversFor(options, http, deviceRepository, base),
            checkBudgetMs: CHECK_BUDGET_MS,
        });
        return service.createQr(key);
    },
    checkQr: async (key) => {
        const secrets = secretsOf(env);
        const payload = await openQrState(key, secrets, Date.now());
        const { repository: deviceRepository, base } = await qrDeviceRepositoryFor(secrets, payload?.device);
        const http = createFetchAuthHttpClient();
        // A missing, tampered or expired `unikey` leaves the replay repository empty. `checkQr`'s own
        // catch-all then answers `{code:800}` for "session not found" exactly as it does for the
        // in-memory store it replaces — no special case needed here.
        const service = createQrLoginService({
            http,
            createSessionHttp: () => createFetchAuthHttpClient({ initialCookies: payload?.cookies ?? '' }),
            deviceRepository,
            sessionResolver: createSealedSessionResolver({ secrets }),
            // 🔴 Seeded as `waiting` on every invocation, because there is nowhere to remember that a
            // previous one already saw `scanned`. That is why `QqQrRelay.poll` is specified to answer
            // with the whole event list rather than a delta: a relay that only reported new events would
            // leave this record stuck at `waiting`, and `checkQr` would answer 801 for a scanned code.
            qrSessionRepository: replayQrSessionRepository(payload ? [replayedRecord(key, payload, 'waiting')] : []),
            capabilities: capabilitiesFor(options),
            drivers: driversFor(options, http, deviceRepository, base),
            checkBudgetMs: CHECK_BUDGET_MS,
        });
        return service.checkQr(key, CHECK_BUDGET_MS);
    },
    cancelSession: async (key) => {
        const relay = options.qqRelay;
        if (relay) {
            const payload = await openQrState(key, secretsOf(env), Date.now()).catch(() => null);
            // Best effort by contract: an unknown, tampered or already-released key is still a success.
            if (payload?.channel === 'qq')
                await relay.close(payload.identifier).catch(() => undefined);
        }
        // §5.3 #5: always 200. Callers cancel fire-and-forget on dialog close.
        (await getService()).cancelSession(key);
    },
});

const operationRequestOf = ({ url, params, token, service, env, options, request, }) => ({
    runtime: 'serverless',
    unverifiedWritesEnabled: env?.QQ_UNVERIFIED_WRITES_ENABLED === '1',
    method: request?.method ?? 'GET',
    body: async () => request?.json(),
    query: (name) => url.searchParams.get(name) ?? undefined,
    // serverless 原来就只读第一个值，两个取法在这边是同一个。
    queryRaw: (name) => url.searchParams.get(name) ?? undefined,
    params,
    token,
    sessionConfigured: Boolean(env?.QQ_SESSION_SECRET),
    service,
    qr: createServerlessQrOperations({ env: env ?? {}, options: options ?? {}, service }),
    capabilities: capabilitiesFor(options ?? {}),
});
const operationRoute = (handler) => async (context) => {
    const result = await handler(operationRequestOf(context));
    return json(result.body, result.status, result.headers);
};

/**
 * A router for seventeen known paths, written by hand.
 *
 * The route set is fixed and tiny — thirteen literals and three with parameters — so a routing
 * library would be a runtime dependency bought for a `switch`. Keeping it here also keeps the
 * serverless bundle at zero npm packages, which is the property the dependency-closure gate
 * actually checks.
 */
/**
 * `/a/:b/:c?` becomes a regex with named groups. Only the two forms the route table uses are
 * supported — a required segment and a trailing optional one — because inventing more would be
 * inventing a router.
 */
const compile = (path, handler) => {
    const keys = [];
    const pattern = path
        .split('/')
        .filter((segment) => segment !== '')
        .map((segment) => {
        if (!segment.startsWith(':'))
            return `/${segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
        const optional = segment.endsWith('?');
        keys.push(segment.slice(1, optional ? -1 : undefined));
        return optional ? '(?:/([^/]+))?' : '/([^/]+)';
    })
        .join('');
    return { path, pattern: new RegExp(`^${pattern}/?$`), keys, handler };
};
const createRouter = (routes) => {
    const staticRoutes = new Map();
    const dynamicRoutes = [];
    for (const [path, handler] of Object.entries(routes)) {
        if (path.includes(':'))
            dynamicRoutes.push(compile(path, handler));
        else
            staticRoutes.set(path, handler);
    }
    return (pathname) => {
        // A trailing slash is the same route; anything else is compared literally.
        const normalized = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
        const exact = staticRoutes.get(normalized);
        if (exact)
            return { handler: exact, params: {}, route: normalized };
        for (const route of dynamicRoutes) {
            const matched = route.pattern.exec(normalized);
            if (!matched)
                continue;
            const params = {};
            route.keys.forEach((key, index) => {
                const value = matched[index + 1];
                // An unmatched optional segment is absent, not empty: the handlers distinguish them.
                if (value !== undefined)
                    params[key] = decodeURIComponent(value);
            });
            return { handler: route.handler, params, route: route.path };
        }
        return null;
    };
};

const AUTH_HEADER_NAME = 'x-qq-session';
/** A single invocation may observe a pull channel this long before it has to answer. */
const tokenFromCookieString = (cookie) => {
    for (const entry of cookie.split(';')) {
        const separator = entry.indexOf('=');
        if (separator <= 0)
            continue;
        if (entry.slice(0, separator).trim() === AUTH_COOKIE_NAME)
            return entry.slice(separator + 1).trim() || undefined;
    }
    return undefined;
};
/** Header > query > cookie, the same order the Koa controller applies (§5.3 #2). */
const authTokenOf = (request, url) => {
    const header = request.headers.get(AUTH_HEADER_NAME)?.trim();
    if (header)
        return header;
    const queried = tokenFromCookieString(url.searchParams.get('cookie') ?? '');
    if (queried)
        return queried;
    return tokenFromCookieString(request.headers.get('cookie') ?? '');
};
/** 新路由的结果已经带好状态码与 header，这里只负责写成 Response。 */
const fromResult = (result) => json(result.body, result.status, result.headers);
const routes = {
    '/login/qr/key': operationRoute(qrKey),
    '/login/qr/create': operationRoute(qrCreate),
    '/login/qr/check': operationRoute(qrCheck),
    '/login/qr/cancel': operationRoute(qrCancel),
    // ---- Session ----------------------------------------------------------------------------
    '/login/status': operationRoute(loginStatus),
    '/logout': operationRoute(logout),
    '/user/detail': operationRoute(userDetail),
    '/user/vip': operationRoute(userVip),
    '/user/daily-songs': operationRoute(userDailySongs),
    '/user/playlist/tracks': operationRoute(playlistTracks),
    '/user/playlist/create': operationRoute(playlistCreate),
    '/user/playlist/rename': operationRoute(playlistRename),
    '/user/playlist/delete': operationRoute(playlistDelete),
    '/user/playlist/subscribe': operationRoute(playlistSubscribe),
    '/user/song/like': operationRoute(songLike),
    '/user/album/subscribe': operationRoute(albumSubscribe),
    '/user/subscription-status': operationRoute(subscriptionStatus),
    '/user/guess-you-like': async ({ service: getService, token }) => fromResult(await guessYouLikeResult(await (await getService()).resolveSession(token))),
    // 有会话就带凭证，没有就匿名。没设密钥时解不开任何会话，也不建服务，直接匿名读。
    '/recommend/playlists': async ({ url, env, service: getService, token }) => {
        const session = env.QQ_SESSION_SECRET && token ? await (await getService()).resolveSession(token) : null;
        return fromResult(await recommendPlaylistsResult(session, recommendPlaylistsLimitOf(url.searchParams.get('limit'))));
    },
    // 公开内容，一律匿名读；没设密钥也能用。
    '/recommend/categories': async () => fromResult(await playlistCategoriesResult()),
    '/recommend/category-playlists': async ({ url }) => fromResult(await categoryPlaylistsResult({
        id: url.searchParams.get('id') ?? undefined,
        page: url.searchParams.get('page') ?? undefined,
        limit: url.searchParams.get('limit') ?? undefined,
    })),
    '/recommend/new-songs': async ({ url }) => fromResult(await newSongsResult(url.searchParams.get('area') ?? undefined)),
    // 有会话就带凭证，没有就匿名搜。没设密钥时解不开任何会话，也不建服务，直接匿名搜。
    '/search': async ({ url, env, service: getService, token }) => {
        const query = {
            keyword: url.searchParams.get('keyword') ?? undefined,
            type: url.searchParams.get('type') ?? undefined,
            page: url.searchParams.get('page') ?? undefined,
            limit: url.searchParams.get('limit') ?? undefined,
        };
        const session = env.QQ_SESSION_SECRET && token ? await (await getService()).resolveSession(token) : null;
        return fromResult(await searchResult(query, session));
    },
    '/radio/list': async ({ service: getService, token }) => fromResult(await radioListResult(await (await getService()).resolveSession(token))),
    '/radio/tracks': async ({ url, service: getService, token }) => fromResult(await radioTracksResult(await (await getService()).resolveSession(token), url.searchParams.get('id'))),
    '/user/playlist': operationRoute(getUserPlaylist),
    '/user/albums': operationRoute(getUserAlbums),
    '/user/liked-songs': operationRoute(getUserLikedSongs),
    // A playlist the user owns, read with their credential. It must stay in this section: the
    // anonymous `/getSongListDetail` below answers an empty shell for a 不公开 playlist.
    '/user/playlist-detail': operationRoute(getOwnedPlaylistSongs),
    '/getMusicPlay/:songmid?': operationRoute(getMusicPlay),
    // ---- Catalog (no credential) ------------------------------------------------------------
    // Anonymous by default, so it stays usable without a secret. Only when the anonymous CGI cannot
    // read the playlist at all (`code: 10`, QQ's own algorithmic playlists) does a session get used,
    // and only on a deployment that can open one; any failure there keeps the anonymous answer.
    '/getSongListDetail/:disstid': operationRoute(getSongListDetail),
    '/getSongInfo/:songmid/:songid?': operationRoute(getSongInfo),
    '/getLyric': operationRoute(getLyricOperation),
    '/getAlbumInfo': operationRoute(getAlbumInfo),
    '/getSingerAlbum': operationRoute(getSingerAlbum),
    '/getSingerHotsong': operationRoute(getSingerHotsong),
};
const NO_SECRET = 'QQ_SESSION_SECRET is not set, so this deployment cannot hold a session. Catalog routes still work.';
/** The routes that need a session secret to mean anything. Catalog routes work without one. */
const LOGIN_ROUTES = new Set([
    '/login/qr/key',
    '/login/qr/create',
    '/login/qr/check',
    '/login/qr/cancel',
    '/login/status',
    '/logout',
    '/user/detail',
    '/user/vip',
    '/user/playlist/tracks',
    '/user/playlist/create',
    '/user/playlist/rename',
    '/user/playlist/delete',
    '/user/playlist/subscribe',
    '/user/song/like',
    '/user/album/subscribe',
    '/user/subscription-status',
    '/user/playlist',
    '/user/albums',
    '/user/liked-songs',
    '/user/playlist-detail',
    '/user/guess-you-like',
    '/user/daily-songs',
    '/radio/list',
    '/radio/tracks',
    '/getMusicPlay/:songmid?',
]);
const match = createRouter(routes);
/**
 * Built per invocation. A Worker may reuse an isolate across requests, and a service holding a
 * cookie jar and QR state from someone else's request is a cross-request leak, not a cache.
 */
const createServiceFor = async (env, options) => {
    const secrets = secretsOf(env);
    return createQrLoginService({
        http: createFetchAuthHttpClient(),
        playbackHintsEnabled: !['0', 'false'].includes(env.QQ_PLAYBACK_HINTS_ENABLED ?? ''),
        createSessionHttp: () => createFetchAuthHttpClient(),
        deviceRepository: createMemoryDeviceContextRepository(await deriveAndroidDevice(secrets.current)),
        sessionResolver: createSealedSessionResolver({ secrets }),
        capabilities: capabilitiesFor(options),
        checkBudgetMs: CHECK_BUDGET_MS,
    });
};
const handleRequest = async (request, env = {}, options = {}) => {
    const url = new URL(request.url);
    const configured = Boolean(env.QQ_SESSION_SECRET);
    if (url.pathname === '/login/channels' || url.pathname === '/login/channels/') {
        return operationRoute(loginChannels)({
            url,
            env,
            options,
            params: {},
            token: undefined,
            service: () => createServiceFor(env, options),
        });
    }
    const matched = match(url.pathname);
    if (!matched) {
        return json({
            code: 501,
            message: `${url.pathname} is not implemented by the serverless runtime. See /login/channels for what this deployment serves.`,
        }, 501);
    }
    // 🔴 Explicit, never a silent downgrade. Without a secret there is no key to seal a session
    // with, and generating one per isolate would make every login vanish on the next cold start.
    if (!configured && LOGIN_ROUTES.has(matched.route)) {
        return json({ code: 501, message: NO_SECRET }, 501);
    }
    // The legacy catalog transport is a module-level registration, so it is set before any catalog
    // service can run. Re-registering an equivalent transport is idempotent.
    setLegacyHttpTransport(createFetchLegacyTransport());
    // Memoised per invocation: a handler may reach for it more than once, and a Worker isolate is
    // shared across requests, so the service (with its cookie jar and QR state) must not outlive one.
    let pending = null;
    const service = () => {
        pending ??= createServiceFor(env, options);
        return pending;
    };
    try {
        return await matched.handler({
            request,
            url,
            params: matched.params,
            service,
            token: authTokenOf(request, url),
            env,
            options,
        });
    }
    catch (error) {
        return failureResponse(error);
    }
};

// EdgeOne Pages Cloud Function (Node.js) adapter for Folia's QQ music backend.
// Route: cloud-functions/api/qq/[[default]].js  ->  matches /api/qq/...

const QQ_API_PREFIX = '/api/qq';

async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  let rest = url.pathname;
  if (rest.startsWith(QQ_API_PREFIX)) rest = rest.slice(QQ_API_PREFIX.length);
  if (!rest.startsWith('/')) rest = '/' + rest;
  const target = new URL(`${rest}${url.search}`, url.origin);

  const env = context.env || {};
  try {
    return await handleRequest(
      new Request(target, request),
      {
        QQ_SESSION_SECRET: env.QQ_SESSION_SECRET,
        QQ_SESSION_SECRET_PREVIOUS: env.QQ_SESSION_SECRET_PREVIOUS,
      },
      { qqRelay: undefined },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ code: 502, message: 'QQ serverless route failed' }),
      { status: 502, headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  }
}

export { onRequest };
export default onRequest;
