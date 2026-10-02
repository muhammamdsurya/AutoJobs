-- Token packs may cost as little as Rp1 (e.g. a test pack). A price too small for a unique code below it is paid at
-- exactly that price, one buyer at a time (see pickAmount in packages/shared/src/payments.ts).
alter table token_packs drop constraint token_packs_price_check;
alter table token_packs add constraint token_packs_price_check check (price between 1 and 10000000);
