const JOINER = '‍';

export const defang = (text: string): string =>
  text
    .replace(/@(?=\w)/g, `@${JOINER}`)
    .replace(/(?<!‍)#(?=\d)/g, `${JOINER}#`)
    .replace(/github(?=\.com)/gi, (host) => `${host}${JOINER}`);
