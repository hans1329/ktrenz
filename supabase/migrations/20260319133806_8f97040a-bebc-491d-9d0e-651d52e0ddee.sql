-- Fix misclassified stars: Girls Generation is a group, Hwasa is a solo artist
UPDATE ktrenz_stars SET star_type = 'group' WHERE id = '6e2e527d-83a4-43fe-96c5-028a38a2bd51';
UPDATE ktrenz_stars SET star_type = 'solo' WHERE id = 'bc3ff3de-15dc-403b-b4eb-2b5f94fe2ee2';