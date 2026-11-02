/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Character properties as Java 25 defines them (the Unicode 16.0 character database), for the characters the
 * library's behaviour depends on. JavaScript engines carry their own Unicode version, so these tables are fixed here
 * instead of being read from regular expression property escapes. Numbers are written in base 36.
 *
 * - ID_PART, LETTER, WHITESPACE: ranges "a-b" or single "a" of UTF-16 code units for which
 *   Character.isJavaIdentifierPart(char), isLetter(char) and isWhitespace(char) are true.
 * - DIGITS: runs "start,length,value" of code units whose Character.digit(char, 36) is value, value + 1, ...
 * - UPPER, LOWER: runs "start,count,delta,stride" of the simple case mappings Character.toUpperCase(int) and
 *   toLowerCase(int): count code points start, start + stride, ... map to themselves plus delta.
 * - SPECIAL_UPPER: "codePoint:unit.unit..." where String.toUpperCase gives more than the simple mapping.
 */

export const ID_PART =
  '0-8 e-r 10 1c-1l 1t-2i 2n 2p-3e 3j-4f 4i-4l 4q 4t 51 56 5c-5y 60-6u 6w-jl jq-k1 kg-kk ks ku lc-ok om-on oq-ot ov ' +
  'p2 p4-p6 p8 pa-pt pv-s5 s7-w1 w3-w7 wa-10v 10x-11y 121 128-13c 13j 13l-14t 14v 14x-14y 150-151 153 15c-162 ' +
  '167-16a 16o-16t 16z 174-17e 17g 17k-19l 19q-1cj 1cl-1ct 1cv-1d4 1d6-1do 1dr 1e7-1fu 1fx-1ip 1j4-1kl 1kq 1kt-1m5 ' +
  '1mo-1nf 1nk-1nu 1o0-1on 1op-1ou 1ow-1ox 1p3-1ur 1uu-1v3 1v5-1vn 1vp-1vw 1vz-1w0 1w3-1wo 1wq-1ww 1wy 1x2-1x5 ' +
  '1x8-1xg 1xj-1xk 1xn-1xq 1xz 1y4-1y5 1y7-1yb 1ye-1yr 1yz-1z0 1z2 1z5-1z7 1z9-1ze 1zj-1zk 1zn-208 20a-20g 20i-20j ' +
  '20l-20m 20o-20p 20s 20u-20y 213-214 217-219 21d 21l-21o 21q 21y-22d 22p-22r 22t-231 233-235 237-23s 23u-240 ' +
  '242-243 245-249 24c-24l 24n-24p 24r-24t 24w 25c-25f 25i-25r 25t 261-267 269-26b 26d-26k 26n-26o 26r-27c 27e-27k ' +
  '27m-27n 27p-27t 27w-284 287-288 28b-28d 28l-28n 28s-28t 28v-28z 292-29b 29d 29u-29v 29x-2a2 2a6-2a8 2aa-2ad ' +
  '2ah-2ai 2ak 2am-2an 2ar-2as 2aw-2ay 2b2-2bd 2bi-2bm 2bq-2bs 2bu-2bx 2c0 2c7 2cm-2cv 2d5 2dc-2do 2dq-2ds 2du-2eg ' +
  '2ei-2ex 2f0-2f8 2fa-2fc 2fe-2fh 2fp-2fq 2fs-2fu 2fx 2g0-2g3 2g6-2gf 2gw-2gz 2h1-2h8 2ha-2hc 2he-2i0 2i2-2ib ' +
  '2id-2ih 2ik-2is 2iu-2iw 2iy-2j1 2j9-2ja 2jh-2ji 2jk-2jn 2jq-2jz 2k1-2k3 2kg-2ks 2ku-2kw 2ky-2mc 2me-2mg 2mi-2mm ' +
  '2ms-2mv 2n3-2n7 2na-2nj 2nu-2nz 2o1-2o3 2o5-2om 2oq-2pd 2pf-2pn 2pp 2ps-2py 2q2 2q7-2qc 2qe 2qg-2qn 2qu-2r3 ' +
  '2r6-2r7 2rl-2t6 2tb-2tq 2ts-2u1 2v5-2v6 2v8 2va-2ve 2vg-2w3 2w5 2w7-2wt 2ww-2x0 2x2 2x4-2xa 2xc-2xl 2xo-2xr 2yo ' +
  '2zc-2zd 2zk-2zt 305 307 309 30e-30n 30p-31o 31t-32c 32e-32v 32x-33w 346 35s-37t 380-3a5 3a8-3b9 3bb 3bh 3bk-3cq ' +
  '3cs-3m0 3m2-3m5 3m8-3me 3mg 3mi-3ml 3mo-3ns 3nu-3nx 3o0-3ow 3oy-3p1 3p4-3pa 3pc 3pe-3ph 3pk-3py 3q0-3rk 3rm-3rp ' +
  '3rs-3tm 3tp-3tr 3uo-3v3 3vk-3xx 3y0-3y5 3y9-4fg 4fj-4fz 4g1-4gq 4gw-4iy 4j2-4jc 4jk-4k5 4kf-4l0 4lc-4lv 4m8-4mk ' +
  '4mm-4mo 4mq-4mr 4n4-4pf 4pj 4pn-4pp 4ps-4q1 4qz-4rd 4rk-4u0 4u8-4ve 4vk-4xh 4xs-4ym 4yo-4yz 4z4-4zf 4zq-50t ' +
  '50w-510 51c-52j 52o-53d 53k-53t 54w-55n 55s-57i 57k-58c 58f-58p 58w-595 59j 59s-5a5 5a7-5am 5c0-5e4 5e8-5eh ' +
  '5ez-5f7 5fk-5ir 5j4-5kn 5kw-5l5 5l9-5ml 5mo-5my 5n4-5oa 5od-5of 5ow-5oy 5p0-5q2 5q8-651 654-659 65c-66d 66g-66l ' +
  '66o-66v 66x 66z 671 673-67x 680-69g 69i-69o 69q 69u-69w 69y-6a4 6a8-6ab 6ae-6aj 6ao-6b0 6b6-6b8 6ba-6bg 6bv-6bz ' +
  '6cq-6cu 6db-6dc 6dw 6e8-6ec 6ee-6en 6ep 6f3 6fk-6fw 6g0-6gw 6hc-6ho 6ht 6hx-6i8 6iq 6iv 6iy-6j7 6j9 6jd-6jh 6jo ' +
  '6jq 6js 6ju-6jx 6jz-6k9 6kc-6kf 6kl-6kp 6ku 6lc-6mg 8ow-8v8 8vf-8vn 8w0-8x1 8x3 8x9 8xc-8yv 8z3 8zj-906 90g-90m ' +
  '90o-90u 90w-912 914-91a 91c-91i 91k-91q 91s-91y 920-926 928-933 94f 9hh-9hj 9i9-9in 9ip-9it 9iw-9j0 9j5-9li ' +
  '9ll-9lm 9lp-9lr 9lt-9oa 9oc-9of 9ol-9pr 9pt-9se 9sw-9tr 9v4-9vj a9s-fcv feo-wi4 wk0-wl9 wlc-wss wsw-wtn wu8-wvj ' +
  'wvo-wvx wvz-wz5 x07-x0f x0i-x3c x3f-x59 x5c-x5d x5f x5h-x5o x6a-x7r x7w x88 x8g-x9v xa8-xc5 xcg-xcp xcw-xdj xdn ' +
  'xdp-xf1 xf4-xg3 xgg-xh8 xhc-xj4 xjj-xjt xk0-xku xkw-xme xmo-xn1 xn4-xnd xnk-xo6 xoa-xqa xqz-xr1 xr4-xrj xrm-xrq ' +
  'xs1-xs6 xs9-xse xsh-xsm xsw-xt2 xt4-xta xtc-xui xuk-xux xv4-xyi xyk-xyl xyo-xyx xz4-16lf 16ls-16me 16mj-16nv ' +
  '1d6o-1dgt 1dgw-1djt 1dkw-1dl2 1dlf-1dlj 1dlp-1dm0 1dm2-1dme 1dmg-1dmk 1dmm 1dmo-1dmp 1dmr-1dms 1dmu-1dpt ' +
  '1dqr-1e0t 1e1c-1e33 1e36-1e4n 1e5s-1e64 1e68-1e6n 1e74-1e7j 1e7n-1e7o 1e8d-1e8f 1e95 1e9c-1e9g 1e9i-1ed8 1edb ' +
  '1edg 1eds-1ee1 1ee9-1eey 1ef3 1ef5-1efu 1eg6-1eim 1eiq-1eiv 1eiy-1ej3 1ej6-1ejb 1eje-1ejg 1ejk-1ejl 1ejp-1ejq ' +
  '1ek9-1ekb ';

export const LETTER =
  '1t-2i 2p-3e 4q 51 56 5c-5y 60-6u 6w-jl jq-k1 kg-kk ks ku og-ok om-on oq-ot ov p2 p4-p6 p8 pa-pt pv-s5 s7-w1 ' +
  'wa-10v 10x-11y 121 128-13c 15c-162 167-16a 17k-18q 19q-19r 19t-1cj 1cl 1d1-1d2 1da-1db 1dm-1do 1dr 1e8 1ea-1f3 ' +
  '1fx-1id 1ip 1je-1ka 1kk-1kl 1kq 1kw-1lh 1lm 1lw 1m0 1mo-1nc 1nk-1nu 1o0-1on 1op-1ou 1pc-1qh 1s4-1tl 1tp 1u8 ' +
  '1ug-1up 1v5-1vk 1vp-1vw 1vz-1w0 1w3-1wo 1wq-1ww 1wy 1x2-1x5 1x9 1xq 1y4-1y5 1y7-1y9 1yo-1yp 1z0 1z9-1ze 1zj-1zk ' +
  '1zn-208 20a-20g 20i-20j 20l-20m 20o-20p 21l-21o 21q 22a-22c 22t-231 233-235 237-23s 23u-240 242-243 245-249 24d ' +
  '24w 25c-25d 261 26d-26k 26n-26o 26r-27c 27e-27k 27m-27n 27p-27t 27x 28s-28t 28v-28x 29d 29v 29x-2a2 2a6-2a8 ' +
  '2aa-2ad 2ah-2ai 2ak 2am-2an 2ar-2as 2aw-2ay 2b2-2bd 2c0 2dh-2do 2dq-2ds 2du-2eg 2ei-2ex 2f1 2fs-2fu 2fx 2g0-2g1 ' +
  '2gw 2h1-2h8 2ha-2hc 2he-2i0 2i2-2ib 2id-2ih 2il 2jh-2ji 2jk-2jl 2k1-2k2 2kk-2ks 2ku-2kw 2ky-2m2 2m5 2mm 2ms-2mu ' +
  '2n3-2n5 2nu-2nz 2o5-2om 2oq-2pd 2pf-2pn 2pp 2ps-2py 2rl-2sw 2sy-2sz 2tc-2ti 2v5-2v6 2v8 2va-2ve 2vg-2w3 2w5 ' +
  '2w7-2wg 2wi-2wj 2wt 2ww-2x0 2x2 2xo-2xr 2yo 30g-30n 30p-31o 32g-32k 35s-36y 37j 380-385 38a-38d 38h 38l-38m ' +
  '38u-38w 391-39d 39q 3a8-3b9 3bb 3bh 3bk-3cq 3cs-3m0 3m2-3m5 3m8-3me 3mg 3mi-3ml 3mo-3ns 3nu-3nx 3o0-3ow 3oy-3p1 ' +
  '3p4-3pa 3pc 3pe-3ph 3pk-3py 3q0-3rk 3rm-3rp 3rs-3tm 3uo-3v3 3vk-3xx 3y0-3y5 3y9-4fg 4fj-4fz 4g1-4gq 4gw-4iy ' +
  '4j5-4jc 4jk-4k1 4kf-4kx 4lc-4lt 4m8-4mk 4mm-4mo 4n4-4oj 4pj 4po 4rk-4u0 4u8-4uc 4uf-4vc 4ve 4vk-4xh 4xs-4ym ' +
  '500-50t 50w-510 51c-52j 52o-53d 54w-55i 55s-578 59j 5c5-5df 5dx-5e4 5fn-5gg 5gu-5gv 5h6-5id 5j4-5k3 5l9-5lb ' +
  '5lm-5ml 5mo-5my 5n4-5oa 5od-5of 5pl-5po 5pq-5pv 5px-5py 5q2 5q8-5vj 5xc-651 654-659 65c-66d 66g-66l 66o-66v 66x ' +
  '66z 671 673-67x 680-69g 69i-69o 69q 69u-69w 69y-6a4 6a8-6ab 6ae-6aj 6ao-6b0 6b6-6b8 6ba-6bg 6ep 6f3 6fk-6fw 6iq ' +
  '6iv 6iy-6j7 6j9 6jd-6jh 6jo 6jq 6js 6ju-6jx 6jz-6k9 6kc-6kf 6kl-6kp 6ku 6mb-6mc 8ow-8v8 8vf-8vi 8vm-8vn 8w0-8x1 ' +
  '8x3 8x9 8xc-8yv 8z3 8zk-906 90g-90m 90o-90u 90w-912 914-91a 91c-91i 91k-91q 91s-91y 920-926 94f 9hh-9hi 9ip-9it ' +
  '9iz-9j0 9j5-9li 9lp-9lr 9lt-9oa 9oc-9of 9ol-9pr 9pt-9se 9sw-9tr 9v4-9vj a9s-fcv feo-wi4 wk0-wl9 wlc-wss wsw-wtb ' +
  'wtm-wtn wu8-wvi wvz-wwt www-wyt x07-x0f x0i-x3c x3f-x59 x5c-x5d x5f x5h-x5o x6a-x6p x6r-x6t x6v-x6y x70-x7m ' +
  'x8g-x9v xaa-xbn xde-xdj xdn xdp-xdq xe2-xet xf4-xfq xgg-xh8 xhg-xiq xjj xk0-xk4 xk6-xkf xkq-xku xkw-xm0 xmo-xmq ' +
  'xms-xmz xnk-xo6 xoa xoe-xpr xpt xpx-xpy xq1-xq5 xq8 xqa xqz-xr1 xr4-xre xrm-xro xs1-xs6 xs9-xse xsh-xsm xsw-xt2 ' +
  'xt4-xta xtc-xui xuk-xux xv4-xya xz4-16lf 16ls-16me 16mj-16nv 1d6o-1dgt 1dgw-1djt 1dkw-1dl2 1dlf-1dlj 1dlp ' +
  '1dlr-1dm0 1dm2-1dme 1dmg-1dmk 1dmm 1dmo-1dmp 1dmr-1dms 1dmu-1dpt 1dqr-1e0t 1e1c-1e33 1e36-1e4n 1e5s-1e63 ' +
  '1e9c-1e9g 1e9i-1ed8 1ee9-1eey 1ef5-1efu 1eg6-1eim 1eiq-1eiv 1eiy-1ej3 1ej6-1ejb 1eje-1ejg ';

export const WHITESPACE =
  '9-d s-w 4g0 6bk-6bq 6bs-6bu 6co-6cp 6e7 9hc ';

export const DIGITS =
  '1c,a,0 1t,q,a 2p,q,a 19c,a,0 1dc,a,0 1j4,a,0 1uu,a,0 1ye,a,0 21y,a,0 25i,a,0 292,a,0 2cm,a,0 2g6,a,0 2jq,a,0 ' +
  '2na,a,0 2qu,a,0 2ts,a,0 2xc,a,0 2zk,a,0 37k,a,0 39s,a,0 4ps,a,0 4r4,a,0 4zq,a,0 53k,a,0 58g,a,0 58w,a,0 5e8,a,0 ' +
  '5gw,a,0 5kw,a,0 5lc,a,0 wtc,a,0 xcg,a,0 xds,a,0 xjk,a,0 xkg,a,0 xn4,a,0 xyo,a,0 1eds,a,0 1ee9,q,a 1ef5,q,a ';

export const UPPER =
  '2p,q,-w,1 51,1,kn,1 68,n,-w,1 6w,7,-w,1 73,1,3d,1 75,o,-1,2 8h,1,-6g,1 8j,3,-1,2 8q,8,-1,2 97,n,-1,2 ai,3,-1,2 ' +
  'an,1,-8c,1 ao,1,5f,1 ar,2,-1,2 aw,1,-1,1 b0,1,-1,1 b6,1,-1,1 b9,1,2p,1 bd,1,-1,1 be,1,4j,1 bf,1,wu9,1 bi,1,3m,1 ' +
  'bl,3,-1,2 bs,1,-1,1 bx,1,-1,1 c0,1,-1,1 c4,2,-1,2 c9,1,-1,1 cd,1,-1,1 cf,1,1k,1 cl,1,-1,1 cm,1,-2,1 co,1,-1,1 ' +
  'cp,1,-2,1 cr,1,-1,1 cs,1,-2,1 cu,8,-1,2 d9,1,-27,1 db,9,-1,2 du,1,-1,1 dv,1,-2,1 dx,1,-1,1 e1,k,-1,2 f7,9,-1,2 ' +
  'fw,1,-1,1 fz,2,8cf,1 g2,1,-1,1 g7,5,-1,2 gg,1,8bj,1 gh,1,8bg,1 gi,1,8bi,1 gj,1,-5u,1 gk,1,-5q,1 gm,2,-5p,1 ' +
  'gp,1,-5m,1 gr,1,-5n,1 gs,1,wnj,1 gw,1,-5p,1 gx,1,wnf,1 gz,1,-5r,1 h0,1,wo7,1 h1,1,wmg,1 h2,1,wn8,1 h4,1,-5t,1 ' +
  'h5,1,-5v,1 h6,1,wn8,1 h7,1,8af,1 h8,1,wn5,1 hb,1,-5v,1 hd,1,8al,1 he,1,-5x,1 hh,1,-5y,1 hp,1,89z,1 hs,1,-62,1 ' +
  'hu,1,wn7,1 hv,1,-62,1 hz,1,wmi,1 i0,1,-62,1 i1,1,-1x,1 i2,2,-61,1 i4,1,-1z,1 ia,1,-63,1 il,1,wlx,1 im,1,wlu,1 ' +
  'n9,1,2c,1 oh,2,-1,2 on,1,-1,1 or,3,3m,1 q4,1,-12,1 q5,3,-11,1 q9,h,-w,1 qq,1,-v,1 qr,9,-w,1 r0,1,-1s,1 ' +
  'r1,2,-1r,1 r4,1,-1q,1 r5,1,-1l,1 r9,1,-1b,1 ra,1,-1i,1 rb,1,-8,1 rd,c,-1,2 s0,1,-2e,1 s1,1,-28,1 s2,1,7,1 ' +
  's3,1,-38,1 s5,1,-2o,1 s8,1,-1,1 sb,1,-1,1 ts,w,-w,1 uo,g,-28,1 v5,h,-1,2 wb,r,-1,2 xu,7,-1,2 y7,1,-f,1 ' +
  'y9,1c,-1,2 129,12,-1c,1 3bk,17,2bk,1 3ct,3,2bk,1 3y0,6,-8,1 5mo,1,-4tq,1 5mp,1,-4tp,1 5mq,1,-4tg,1 5mr,2,-4te,1 ' +
  '5mt,1,-4tf,1 5mu,1,-4t8,1 5mv,1,-4rp,1 5mw,1,r7m,1 5my,1,-1,1 5tl,1,r9g,1 5tp,1,2xy,1 5u6,1,raw,1 5xd,23,-1,2 ' +
  '61n,1,-1n,1 61t,1c,-1,2 64g,8,8,1 64w,6,8,1 65c,8,8,1 65s,8,8,1 668,6,8,1 66p,4,8,2 674,8,8,1 67k,2,22,1 ' +
  '67m,4,2e,1 67q,2,2s,1 67s,2,3k,1 67u,2,34,1 67w,2,3i,1 680,8,8,1 68g,8,8,1 68w,8,8,1 69c,2,8,1 69f,1,9,1 ' +
  '69q,1,-5k5,1 69v,1,9,1 6a8,2,8,1 6ao,2,8,1 6at,1,7,1 6b7,1,9,1 6ku,1,-s,1 6ls,g,-g,1 6mc,1,-1,1 79s,q,-q,1 ' +
  '8q8,1c,-1c,1 8rl,1,-1,1 8rp,1,-8bv,1 8rq,1,-8bs,1 8rs,3,-1,2 8s3,1,-1,1 8s6,1,-1,1 8sh,1e,-1,2 8vg,2,-1,2 ' +
  '8vn,1,-1,1 8w0,12,-5ls,1 8x3,1,-5ls,1 8x9,1,-5ls,1 wu9,n,-1,2 ww1,e,-1,2 x0j,7,-1,2 x0z,v,-1,2 x2y,2,-1,2 ' +
  'x33,5,-1,2 x3g,1,-1,1 x3l,2,-1,2 x3o,1,1c,1 x3r,a,-1,2 x4l,8,-1,2 x54,2,-1,2 x59,1,-1,1 x5d,1,-1,1 x5j,3,-1,2 ' +
  'x6e,1,-1,1 xub,1,-ps,1 xv4,28,-tzk,1 1ef5,q,-w,1 1fe0,14,-14,1 1fiw,10,-14,1 1fo7,b,-13,1 1foj,f,-13,1 ' +
  '1foz,7,-13,1 1fp7,2,-13,1 1h34,1f,-1s,1 1h80,m,-w,1 1jgg,w,-w,1 20dc,w,-w,1 2oma,y,-y,1 ';

export const LOWER =
  '1t,q,w,1 5c,n,w,1 60,7,w,1 74,o,1,2 8g,1,-5j,1 8i,3,1,2 8p,8,1,2 96,n,1,2 ag,1,-3d,1 ah,3,1,2 ap,1,5u,1 aq,2,1,2 ' +
  'au,1,5q,1 av,1,1,1 ax,2,5p,1 az,1,1,1 b2,1,27,1 b3,1,5m,1 b4,1,5n,1 b5,1,1,1 b7,1,5p,1 b8,1,5r,1 ba,1,5v,1 ' +
  'bb,1,5t,1 bc,1,1,1 bg,1,5v,1 bh,1,5x,1 bj,1,5y,1 bk,3,1,2 bq,1,62,1 br,1,1,1 bt,1,62,1 bw,1,1,1 by,1,62,1 ' +
  'bz,1,1,1 c1,2,61,1 c3,2,1,2 c7,1,63,1 c8,1,1,1 cc,1,1,1 ck,1,2,1 cl,1,1,1 cn,1,2,1 co,1,1,1 cq,1,2,1 cr,9,1,2 ' +
  'da,9,1,2 dt,1,2,1 du,2,1,2 dy,1,-2p,1 dz,1,-1k,1 e0,k,1,2 f4,1,-3m,1 f6,9,1,2 fu,1,8bv,1 fv,1,1,1 fx,1,-4j,1 ' +
  'fy,1,8bs,1 g1,1,1,1 g3,1,-5f,1 g4,1,1x,1 g5,1,1z,1 g6,5,1,2 og,2,1,2 om,1,1,1 ov,1,38,1 p2,1,12,1 p4,3,11,1 ' +
  'p8,1,1s,1 pa,2,1r,1 pd,h,w,1 pv,9,w,1 r3,1,8,1 rc,c,1,2 s4,1,-1o,1 s7,1,1,1 s9,1,-7,1 sa,1,1,1 sd,3,-3m,1 ' +
  'sg,g,28,1 sw,w,w,1 v4,h,1,2 wa,r,1,2 xs,1,f,1 xt,7,1,2 y8,1c,1,2 10x,12,1c,1 3a8,12,5ls,1 3bb,1,5ls,1 ' +
  '3bh,1,5ls,1 3vk,28,tzk,1 3xs,6,8,1 5mx,1,1,1 5n4,17,-2bk,1 5od,3,-2bk,1 5xc,23,1,2 61q,1,-5vj,1 61s,1c,1,2 ' +
  '64o,8,-8,1 654,6,-8,1 65k,8,-8,1 660,8,-8,1 66g,6,-8,1 66x,4,-8,2 67c,8,-8,1 688,8,-8,1 68o,8,-8,1 694,8,-8,1 ' +
  '69k,2,-8,1 69m,2,-22,1 69o,1,-9,1 6a0,4,-2e,1 6a4,1,-9,1 6ag,2,-8,1 6ai,2,-2s,1 6aw,2,-8,1 6ay,2,-34,1 ' +
  '6b0,1,-7,1 6bc,2,-3k,1 6be,2,-3i,1 6bg,1,-9,1 6jq,1,-5st,1 6ju,1,-6gv,1 6jv,1,-6di,1 6k2,1,s,1 6lc,g,g,1 ' +
  '6mb,1,1,1 792,q,q,1 8ow,1c,1c,1 8rk,1,1,1 8rm,1,-8af,1 8rn,1,-2xy,1 8ro,1,-89z,1 8rr,3,1,2 8rx,1,-8bg,1 ' +
  '8ry,1,-8al,1 8rz,1,-8bj,1 8s0,1,-8bi,1 8s2,1,1,1 8s5,1,1,1 8se,2,-8cf,1 8sg,1e,1,2 8vf,2,1,2 8vm,1,1,1 wu8,n,1,2 ' +
  'ww0,e,1,2 x0i,7,1,2 x0y,v,1,2 x2x,2,1,2 x31,1,-r9g,1 x32,5,1,2 x3f,1,1,1 x3h,1,-wmg,1 x3k,2,1,2 x3q,a,1,2 ' +
  'x4a,1,-wn8,1 x4b,1,-wnj,1 x4c,1,-wnf,1 x4d,1,-wn5,1 x4e,1,-wn8,1 x4g,1,-wlu,1 x4h,1,-wmi,1 x4i,1,-wlx,1 ' +
  'x4j,1,ps,1 x4k,8,1,2 x50,1,-1c,1 x51,1,-wn7,1 x52,1,-raw,1 x53,2,1,2 x57,1,-wo7,1 x58,1,1,1 x5c,1,1,1 x5i,3,1,2 ' +
  'x5o,1,-wu9,1 x6d,1,1,1 1ee9,q,w,1 1fcw,14,14,1 1fhs,10,14,1 1fn4,b,13,1 1fng,f,13,1 1fnw,7,13,1 1fo4,2,13,1 ' +
  '1h1c,1f,1s,1 1h74,m,w,1 1jfk,w,w,1 20cg,w,w,1 2olc,y,y,1 ';

export const SPECIAL_UPPER =
  '67:2b.2b 95:jg.26 ds:22.lo pc:pl.lk.ld q8:px.lk.ld 13b:111.11u 61i:20.mp 61j:2c.lk 61k:2f.lm 61l:2h.lm 61m:1t.ji ' +
  '66o:px.lv 66q:px.lv.lc 66s:px.lv.ld 66u:px.lv.n6 680:64o.pl 681:64p.pl 682:64q.pl 683:64r.pl 684:64s.pl ' +
  '685:64t.pl 686:64u.pl 687:64v.pl 688:64o.pl 689:64p.pl 68a:64q.pl 68b:64r.pl 68c:64s.pl 68d:64t.pl 68e:64u.pl ' +
  '68f:64v.pl 68g:65k.pl 68h:65l.pl 68i:65m.pl 68j:65n.pl 68k:65o.pl 68l:65p.pl 68m:65q.pl 68n:65r.pl 68o:65k.pl ' +
  '68p:65l.pl 68q:65m.pl 68r:65n.pl 68s:65o.pl 68t:65p.pl 68u:65q.pl 68v:65r.pl 68w:67c.pl 68x:67d.pl 68y:67e.pl ' +
  '68z:67f.pl 690:67g.pl 691:67h.pl 692:67i.pl 693:67j.pl 694:67c.pl 695:67d.pl 696:67e.pl 697:67f.pl 698:67g.pl ' +
  '699:67h.pl 69a:67i.pl 69b:67j.pl 69e:69m.pl 69f:pd.pl 69g:p2.pl 69i:pd.n6 69j:pd.n6.pl 69o:pd.pl 69u:6a2.pl ' +
  '69v:pj.pl 69w:p5.pl 69y:pj.n6 69z:pj.n6.pl 6a4:pj.pl 6aa:pl.lk.lc 6ab:pl.lk.ld 6ae:pl.n6 6af:pl.lk.n6 ' +
  '6aq:px.lk.lc 6ar:px.lk.ld 6as:pt.lv 6au:px.n6 6av:px.lk.n6 6b6:6be.pl 6b7:q1.pl 6b8:pb.pl 6ba:q1.n6 6bb:q1.n6.pl ' +
  '6bg:q1.pl 1dkw:1y.1y 1dkx:1y.21 1dky:1y.24 1dkz:1y.1y.21 1dl0:1y.1y.24 1dl1:2b.2c 1dl2:2b.2c 1dlf:11g.11i ' +
  '1dlg:11g.111 1dlh:11g.117 1dli:11q.11i 1dlj:11g.119 ';
