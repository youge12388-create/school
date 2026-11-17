export function containsPersonalContact(text: string) {
  return /(?:\b1[3-9]\d{9}\b|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:护照|身份证|微信号|电话|手机号)\s*[:：]?\s*\S+)/iu.test(text);
}

export function containsSensitiveRestriction(text: string) {
  const sensitiveIdentity = /种族|人种|族裔|肤色|肤白|肤黑|白皙|浅肤|深肤|白皮|黑皮|(?:白|黑|深色|浅色)皮肤|皮肤.{0,6}(?:白|黑|颜色|色泽)|黑人|白人|宗教(?!学)|穆斯林|伊斯兰(?!学)/iu;
  const explicitRestriction = /不招|不收|不录取|拒招|拒收|拒录|只招|仅招|只收|仅收|招生限制|生源限制|限制生源/iu;
  const institutionalPreference = /(?:学校|院校|该校|招生方|校方).{0,12}(?:偏好|偏爱|偏向|倾向|喜欢|排斥|拒绝|不接受)/iu;
  const demographic = /国籍|国别|生源|民族|(?:某|特定|指定|部分|其他|外国|海外)(?:地区|国家)|(?:地区|国家).{0,6}(?:学生|申请人)|南亚|东南亚|非洲|欧美|欧裔|非裔|亚裔|中东|孟加拉|尼日利亚|巴基斯坦/iu;
  const preference = /限制|不接受|拒绝|不要|偏好|偏爱|偏向|倾向|喜欢|优先|排斥|排除/iu;
  return sensitiveIdentity.test(text) || explicitRestriction.test(text) || institutionalPreference.test(text) || (demographic.test(text) && preference.test(text));
}
