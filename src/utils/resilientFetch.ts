export interface ResilientFetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
}

function isNetworkFetchError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('err_network') ||
    msg.includes('fetch')
  );
}

async function diagnoseConnectivityFailure(): Promise<string> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3500);
    const healthRes = await fetch('/api/health', {
      method: 'GET',
      credentials: 'same-origin',
      redirect: 'manual',
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (healthRes.type === 'opaqueredirect' || (healthRes.status >= 300 && healthRes.status < 400)) {
      return 'انتهت صلاحية جلسة المصادقة في سحابة المعاينة (Cloud Run 302). يرجى تحديث الصفحة لتجديد تسجيل الدخول ثم إعادة الإرسال.';
    }
    if (!healthRes.ok) {
      return `الخادم الخلفي أعاد حالة HTTP ${healthRes.status}. يرجى الانتظار لحظات والمحاولة مجدداً.`;
    }
    return 'الخادم متصل (/api/health سليم)، لكن الطلب المرسل تعذر إكماله (قد يكون بسبب انقطاع لحظي أو حجم مرفقات يتجاوز 20 MB). حاول مجدداً.';
  } catch {
    return 'تعذر الوصول إلى خادم المنصة (تأكد من اتصال الإنترنت أو عدم انطفاء خادم المعاينة على المنفذ 3000، ثم أعد المحاولة).';
  }
}

export async function resilientFetchResponse(
  url: string,
  options: ResilientFetchOptions = {}
): Promise<Response> {
  const { timeoutMs = 95000, retries = 1, ...fetchInit } = options;
  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        credentials: 'same-origin',
        redirect: 'manual',
        ...fetchInit,
        signal: fetchInit.signal ?? controller.signal,
      });
      clearTimeout(timer);

      if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
        throw new Error(
          'انتهت صلاحية جلسة المصادقة في بيئة المعاينة (Cloud Run 302). يرجى تحديث الصفحة لتجديد جلسة Google ثم إعادة المحاولة.'
        );
      }

      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('استغرق الطلب وقتاً أطول من المتوقع وانتهت المهلة الزمنية. يرجى المحاولة مرة أخرى.');
      }
      if (attempt < retries && isNetworkFetchError(err)) {
        await new Promise((r) => setTimeout(r, 700));
        continue;
      }
      if (isNetworkFetchError(err)) {
        const diagnosed = await diagnoseConnectivityFailure();
        throw new Error(diagnosed);
      }
      throw err;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('تعذر إتمام الاتصال بالخادم.');
}

export async function resilientFetchJson<T>(
  url: string,
  options: ResilientFetchOptions = {}
): Promise<T> {
  const res = await resilientFetchResponse(url, options);
  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    if (contentType.includes('application/json')) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error || `خطأ من الخادم (HTTP ${res.status}).`);
    }
    const text = (await res.text().catch(() => '')).trim();
    throw new Error(
      text && text.length < 220
        ? text
        : `تعذر إتمام الطلب (HTTP ${res.status}). تأكد من أن الجلسة نشطة وأن الخادم يعمل.`
    );
  }
  return (await res.json()) as T;
}
