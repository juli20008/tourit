import { mapDDFToSupabase } from './lib/adapters/ListingAdapter';

const sampleData = {
  ListingKey: '29524858',
  ListingId: 'E12928544',
  City: 'Whitby (Port Whitby)',
  Lease: '3500.00',
  PublicRemarks: 'Modern Living...',
  ModificationTimestamp: 'Fri, 27 Mar 2026 15:36:45 GMT',
  PhotosChangeTimestamp: 'Fri, 22 Apr 2026 10:34:45.593 GMT',
  ListPrice: '0',
  StateOrProvince: 'ON',
  PostalCode: 'L1N 9B1',
  Country: 'CA',
  Status: 'A',
  TransactionType: 'Lease',
  BedroomsTotal: '3',
  BathroomsTotal: '2',
  BathroomsHalf: '1',
  BuildingAreaTotal: '1200-1399',
  BuildingAreaUnits: 'sqft',
  YearBuilt: '2020',
  StreetNumber: '123',
  StreetName: 'Main',
  StreetSuffix: 'St',
  UnitNumber: '12',
  ListAgentFullName: 'Jane Agent',
  ListOfficeName: 'Example Brokerage',
  ParkingTotal: '2',
  GarageYN: 'True',
  Heating: 'Forced Air',
  Cooling: 'Central Air',
  PhotosCount: '18',
  ListAOR: 'reb82',
  MoreInformationLink: 'https://example.com/listings/E12928544',
};

function main() {
  const result = mapDDFToSupabase(sampleData);

  console.log('--- Mapped Result ---');
  console.log(JSON.stringify(result, null, 2));
  console.log('external_id:', result.external_id);
  console.log('realtor_link:', result.realtor_link);
  console.log('list_price:', result.list_price);
  console.log("city:", result.city);
  console.log('garage_yn:', result.garage_yn);
  console.log('photos_count:', result.photos_count);
  console.log('photos_timestamp:', result.photos_timestamp);
  console.log('board_id:', result.board_id);
  console.log('images:', JSON.stringify(result.images));
  console.log('updated_at is valid Date:', result.updated_at instanceof Date && !Number.isNaN(result.updated_at.getTime()));
}

main();
