export type PlayerIntent = 'grant_rest' | 'deny_rest' | 'urge' | 'apologize' | 'verify';

/**
 * 这是一组营地中文命令，不冒充通用语言理解。先排除引述、假设、疑问和
 * 对命令的否定，再识别白名单。不能确定的文本仅作为对话保存，不改世界。
 */
export function parsePlayerIntent(text: string): PlayerIntent | null {
  const value = text.trim().replace(/[。！!，,\s]/g, '');
  if (!value || /[?？“”"「」『』]|如果|假如|是不是|能不能|会怎样|他说|她说|不要再说|别再说|还是|或许|也许|吗|不需要道歉|不用道歉/.test(value)) return null;
  const denied = /^(?:不准|不许|不能|不给|不让|别|不要)(?:你)?休息(?:继续(?:干活|工作)|接着(?:干活|工作))?$/.test(value)
    || /^(?:继续|接着)(?:干活|工作)(?:不准|不许|不能|别|不要)休息$/.test(value);
  if (denied) return 'deny_rest';
  if (/^(?:现在|马上|你|先|可以|允许你|同意你)*(?:就)?(?:去)?休息(?:一会儿|吧|一下)?$/.test(value)) return 'grant_rest';
  if (/^(?:继续|接着|赶紧|快点)(?:干活|工作|干)(?:吧)?$/.test(value)) return 'urge';
  if (/^(?:抱歉|对不起)(?:是我安排得不妥|刚才是我不对|我安排错了)?$/.test(value)) return 'apologize';
  if (/^(?:我要|让我|现在)?(?:核查|检查)(?:一下)?(?:你的说法|你说的话|工作进度|实际进度)$/.test(value)) return 'verify';
  return null;
}
